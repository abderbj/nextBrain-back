import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ChatCompletionMessageDto } from './dto/create-chat-completion.request';
import { PrismaService } from '../prisma/prisma.service';
import { SenderType, ModelType } from '@prisma/client';

export interface GeminiChatMetadata {
    id: number;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    messages: Array<{
        id: number;
        senderType: SenderType;
        message: string;
        sentAt: Date;
    }>;
}

@Injectable()
export class GeminiService {
    private readonly apiKey = process.env.GEMINI_API_KEY;
    private readonly baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

    constructor(private readonly prisma: PrismaService) {}

    // Enhanced model type check for Gemini chat operations
    private isGeminiChat(conversation: any): boolean {
        return conversation?.model_type === ModelType.GEMINI;
    }

    private getModelTypeForGemini(): ModelType {
        // For future expansion if multiple Gemini models are supported
        return ModelType.GEMINI;
    }

    // Try multiple RAG service base URLs with enhanced error handling and chunk processing
    private async fetchRagContext(question: string, assistantCategoryId?: number): Promise<string> {
        if (!assistantCategoryId) return '';

        const tried: string[] = [];
        const bases = [] as string[];
        if (process.env.RAG_SERVICE_URL) bases.push(process.env.RAG_SERVICE_URL);
        bases.push('http://host.docker.internal:8001');
        bases.push('http://127.0.0.1:8001');
        bases.push('http://localhost:8001');

        // Deduplicate while preserving order
        const uniqueBases = Array.from(new Set(bases.map(b => b.replace(/\/$/, ''))));

        for (const base of uniqueBases) {
            const ragUrl = base.endsWith('/query') ? base : `${base}/query`;
            tried.push(ragUrl);
            try {
                console.log(`[Gemini RAG] Trying URL: ${ragUrl}`);
                const { data } = await axios.post(ragUrl, {
                    question,
                    limit: 5,
                    category_id: String(assistantCategoryId),
                }, { timeout: 3000 });

                if (data && Array.isArray(data.source_chunks) && data.source_chunks.length > 0) {
                    // Deduplicate by chunk_id (or fallback to text) and limit total size
                    const chunks = data.source_chunks as Array<any>;
                    const uniqueMap = new Map<string | number, any>();
                    for (const c of chunks) {
                        const key = c.chunk_id ?? c.id ?? c.text;
                        if (!uniqueMap.has(key)) uniqueMap.set(key, c);
                    }
                    const uniqueChunks = Array.from(uniqueMap.values());

                    const MAX_CHUNKS = 5; // take top-N chunks
                    const MAX_CHARS = 4000; // cap combined characters (Gemini context limit)

                    const selected: any[] = [];
                    let chars = 0;
                    for (const c of uniqueChunks) {
                        if (selected.length >= MAX_CHUNKS) break;
                        const text = String(c.text || '').trim();
                        if (!text) continue;
                        if (chars + text.length > MAX_CHARS) break;
                        selected.push(c);
                        chars += text.length;
                    }

                    // Enhanced RAG context formatting optimized for Gemini's context processing
                    const ragContext = [
                        "Context Analysis Instructions:",
                        "1. Below are relevant excerpts from verified knowledge sources",
                        "2. Each excerpt is labeled with its source document",
                        "3. Focus on these key guidelines:",
                        "   - Use this context as your primary information source",
                        "   - Cross-reference information between chunks when relevant",
                        "   - Prioritize recent or authoritative sources if information conflicts",
                        "   - Stay focused on information directly from these sources",
                        "   - Clearly indicate when synthesizing information across multiple chunks\n",
                        "Reference Materials:",
                        ...selected.map((c: any, i: number) => 
                            `[Source ${i + 1}] Document: ${c.file_path ?? 'unknown'}\n${c.text}`
                        )
                    ].join('\n\n');

                    console.log(`[Gemini RAG] Success: ${chunks.length} chunks from ${ragUrl}, using ${selected.length} unique chunks (${chars} chars)`);
                    return ragContext;
                }

                console.log(`[Gemini RAG] Response received but no chunks from ${ragUrl}`);
                return '';
            } catch (err: any) {
                const msg = err?.message || String(err);
                console.warn(`[Gemini RAG] Request failed for ${ragUrl}: ${msg}`);
                // continue to next candidate
            }
        }

        console.warn('[Gemini RAG] All endpoints failed:', tried.join(', '));
        return '';
    }

    async createChat(userId: number, title = 'New Chat'): Promise<number> {
        const conversation = await this.prisma.chatbotConversation.create({
            data: {
                title,
                user_id: userId,
                model_type: this.getModelTypeForGemini(), // Use helper for consistency
            },
        });
        return conversation.id;
    }

    async updateChatTitle(chatId: number, title: string) {
        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                model_type: this.getModelTypeForGemini()
            },
        });
        if (!this.isGeminiChat(conversation)) {
            throw new Error('Gemini chat not found');
        }
        
        await this.prisma.chatbotConversation.update({
            where: { id: chatId },
            data: { title },
        });
    }

    async addMessageAndGetCompletion(
        chatId: number,
        message: ChatCompletionMessageDto,
        assistantCategoryId?: number
    ): Promise<{ response: string | null }> {
        // Validate API key early
        if (!this.apiKey) {
            console.error('[Gemini] GEMINI_API_KEY is not set in environment');
            throw new Error('GEMINI_API_KEY not set. Gemini service is unavailable.');
        }

        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                model_type: this.getModelTypeForGemini()
            },
            include: {
                messages: {
                    orderBy: { sent_at: 'asc' },
                },
            },
        });
        
        if (!this.isGeminiChat(conversation)) {
            throw new Error('Gemini chat not found');
        }

        // Set title from first user message if it's still "New Chat"
        if (
            conversation && 
            conversation.messages.length === 0 &&
            message.role === 'user' &&
            conversation.title === 'New Chat'
        ) {
            if (typeof message.content === 'string') {
                await this.prisma.chatbotConversation.update({
                    where: { id: chatId },
                    data: { title: message.content.slice(0, 100) },
                });
            }
        }

        // Save user message to database
        await this.prisma.chatbotMessage.create({
            data: {
                conversation_id: chatId,
                sender_type: 'USER',
                message: message.content,
            },
        });

        // Get all messages for context
        const allMessages = await this.prisma.chatbotMessage.findMany({
            where: { conversation_id: chatId },
            orderBy: { sent_at: 'asc' },
        });

        // If an assistantCategoryId was provided, call RAG service to get relevant chunks
    const ragContext = await this.fetchRagContext(message.content, assistantCategoryId);

        // Validate API key early so we fail fast with clear message
        if (!this.apiKey) {
            console.error('GEMINI_API_KEY is not set in environment; cannot call Gemini API');
            throw new Error('GEMINI_API_KEY not set. Gemini response generation is disabled.');
        }

        // Convert messages to Gemini format
        const geminiMessages = allMessages.map(msg => ({
            role: msg.sender_type === 'USER' ? 'user' : 'model',
            parts: [{ text: msg.message }]
        }));

        // If we have ragContext, inject it as a system-like first message with enhanced instructions
        if (ragContext) {
            geminiMessages.unshift({ 
                role: 'system', 
                parts: [{ 
                        text: `You are an expert AI assistant responsible for providing accurate and detailed responses based on the given context.
                        RESPONSE GUIDELINES:
                        1. Thoroughly analyze all context sections before formulating your response
                        2. Base your answer primarily on the information from the provided sources
                        3. Reference specific sources using [Source X] notation when drawing from them
                        4. When relevant information spans multiple sources, integrate it seamlessly
                        5. If the provided context is insufficient, clearly state this limitation
                        6. Structure your responses with clear sections and logical flow
                        7. Ensure factual accuracy and maintain an informative tone
                        8. When synthesizing information, explain your reasoning
                        ${ragContext}` 
                    }] 
            });
        }

        try {
            // Log payload for debugging when running locally
            console.debug('Sending request to Gemini API', { url: this.baseUrl, keyPresent: !!this.apiKey, payloadPreview: JSON.stringify({ contents: geminiMessages }).slice(0, 2000) });

            const { data } = await axios.post(
                `${this.baseUrl}?key=${this.apiKey}`,
                {
                    contents: geminiMessages.map(msg => ({
                        role: msg.role === 'system' ? 'user' : msg.role, // Gemini doesn't support system role, convert to user
                        parts: msg.parts
                    })),
                    generationConfig: {
                        maxOutputTokens: 2048,
                        temperature: 0.7,
                        topP: 0.8,
                        topK: 40
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Extract response text and handle potential missing data
            const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!responseText) {
                console.error('Unexpected Gemini API response format:', data);
                throw new Error('Invalid response format from Gemini API');
            }

            // Save AI response to database
            await this.prisma.chatbotMessage.create({
                data: {
                    conversation_id: chatId,
                    sender_type: 'BOT',
                    message: responseText,
                },
            });
            return { response: responseText };
            return { response: null };
        } catch (error: any) {
            // Provide richer logging to troubleshoot 4xx/5xx responses
            console.error('Gemini API error:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message,
            });
            const statusPart = error.response?.status ? ` (status ${error.response.status})` : '';
            throw new Error('Failed to get response from Gemini' + statusPart);
        }
    }

    async regenerateLastResponse(chatId: number, assistantCategoryId?: number): Promise<{ response: string | null }> {
        // Validate API key early
        if (!this.apiKey) {
            console.error('[Gemini] GEMINI_API_KEY is not set in environment');
            throw new Error('GEMINI_API_KEY not set. Gemini service is unavailable.');
        }

        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                model_type: this.getModelTypeForGemini()
            },
        });
        if (!this.isGeminiChat(conversation)) {
            throw new Error('Gemini chat not found');
        }
        
        // Remove last BOT message
        const lastBotMessage = await this.prisma.chatbotMessage.findFirst({
            where: {
                conversation_id: chatId,
                sender_type: 'BOT',
            },
            orderBy: { sent_at: 'desc' },
        });

        if (lastBotMessage) {
            await this.prisma.chatbotMessage.delete({
                where: { id: lastBotMessage.id },
            });
        }

        // Get all remaining messages for context
        const allMessages = await this.prisma.chatbotMessage.findMany({
            where: { conversation_id: chatId },
            orderBy: { sent_at: 'asc' },
        });

    // If an assistantCategoryId was provided, call RAG service to get relevant chunks
    const ragContext = await this.fetchRagContext(allMessages.map(m => m.message).join('\n'), assistantCategoryId);

        // Convert messages to Gemini format
        const geminiMessages = allMessages.map(msg => ({
            role: msg.sender_type === 'USER' ? 'user' : 'model',
            parts: [{ text: msg.message }]
        }));

        if (ragContext) {
            geminiMessages.unshift({ role: 'system', parts: [{ text: `Use the following contextual chunks from the knowledge base to answer the user's question.\n\n${ragContext}` }] });
        }

        try {
            console.debug('Regenerating with Gemini API', { url: this.baseUrl, keyPresent: !!this.apiKey });

            const { data } = await axios.post(
                `${this.baseUrl}?key=${this.apiKey}`,
                {
                    contents: geminiMessages.map(msg => ({
                        role: msg.role === 'system' ? 'user' : msg.role,
                        parts: msg.parts
                    })),
                    generationConfig: {
                        maxOutputTokens: 2048,
                        temperature: 0.7,
                        topP: 0.8,
                        topK: 40
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Extract response text and handle potential missing data
            const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!responseText) {
                console.error('Unexpected Gemini API response format:', data);
                throw new Error('Invalid response format from Gemini API');
            }

            // Save new AI response to database
            await this.prisma.chatbotMessage.create({
                data: {
                    conversation_id: chatId,
                    sender_type: 'BOT',
                    message: responseText,
                },
            });
            return { response: responseText };
            return { response: null };
        } catch (error: any) {
            console.error('Gemini API error:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message,
            });
            const statusPart = error.response?.status ? ` (status ${error.response.status})` : '';
            throw new Error('Failed to get response from Gemini' + statusPart);
        }
    }

    async getChat(chatId: number, userId: number): Promise<GeminiChatMetadata | null> {
        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                user_id: userId,
                model_type: this.getModelTypeForGemini()
            },
            include: {
                messages: {
                    orderBy: { sent_at: 'asc' },
                },
            },
        });
        
        if (!conversation) return null;
        
        return {
            id: conversation.id,
            title: conversation.title,
            createdAt: conversation.started_at,
            updatedAt: conversation.updated_at,
            messages: conversation.messages.map(msg => ({
                id: msg.id,
                senderType: msg.sender_type,
                message: msg.message,
                sentAt: msg.sent_at,
            })),
        };
    }

    async listChats(userId: number) {
        const conversations = await this.prisma.chatbotConversation.findMany({
            where: { 
                user_id: userId,
                model_type: this.getModelTypeForGemini()
            },
            orderBy: { updated_at: 'desc' },
        });
        
        return conversations.map(conversation => ({
            id: conversation.id,
            title: conversation.title,
            createdAt: conversation.started_at,
            updatedAt: conversation.updated_at,
        }));
    }

    async addMessageAndGetCompletionStream(
        chatId: number,
        message: ChatCompletionMessageDto,
        res: any,
        assistantCategoryId?: number,
        model?: string,
    ): Promise<void> {
        // Validate API key early
        if (!this.apiKey) {
            console.error('[Gemini] GEMINI_API_KEY is not set in environment');
            throw new Error('GEMINI_API_KEY not set. Gemini service is unavailable.');
        }

        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                model_type: this.getModelTypeForGemini()
            },
            include: {
                messages: {
                    orderBy: { sent_at: 'asc' },
                },
            },
        });
        
        if (!this.isGeminiChat(conversation)) {
            throw new Error('Gemini chat not found');
        }

        // Set title from first user message if it's still "New Chat"
        if (
            conversation &&
            conversation.messages.length === 0 &&
            message.role === 'user' &&
            conversation.title === 'New Chat'
        ) {
            if (typeof message.content === 'string') {
                await this.prisma.chatbotConversation.update({
                    where: { id: chatId },
                    data: { title: message.content.slice(0, 100) },
                });
            }
        }

        // Save user message to database
        await this.prisma.chatbotMessage.create({
            data: {
                conversation_id: chatId,
                sender_type: 'USER',
                message: message.content,
            },
        });

        // Get all messages for context
        const allMessages = await this.prisma.chatbotMessage.findMany({
            where: { conversation_id: chatId },
            orderBy: { sent_at: 'asc' },
        });

        // Get RAG context if assistantCategoryId is provided
        const ragContext = await this.fetchRagContext(message.content, assistantCategoryId);

        // Convert messages to Gemini format
        const geminiMessages = allMessages.map(msg => ({
            role: msg.sender_type === 'USER' ? 'user' : 'model',
            parts: [{ text: msg.message }]
        }));

        // If we have ragContext, inject it as a system-like first message
        if (ragContext) {
            geminiMessages.unshift({ role: 'system', parts: [{ text: `Use the following contextual chunks from the knowledge base to answer the user's question.\n\n${ragContext}` }] });
        }

        let accumulatedContent = '';

        try {
            console.debug('Sending streaming request to Gemini API', { 
                url: this.baseUrl, 
                keyPresent: !!this.apiKey 
            });

            // Prepare the Gemini API request properly
            const response = await axios.post(
                `${this.baseUrl}?key=${this.apiKey}`,
                {
                    contents: geminiMessages.map(msg => ({
                        role: msg.role === 'system' ? 'user' : msg.role, // Gemini doesn't support system role, convert to user
                        parts: msg.parts
                    })),
                    generationConfig: {
                        maxOutputTokens: 2048,
                        temperature: 0.7,
                        topP: 0.8,
                        topK: 40
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Since Gemini API doesn't support native streaming, we'll simulate it by chunking the response
            const responseText = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (responseText) {
                if (!res.headersSent) {
                    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    res.setHeader('Transfer-Encoding', 'chunked');
                }

                // Split response into larger chunks for more stable streaming
                const chunkSize = 100; // Increased chunk size for better stability
                const chunks: string[] = [];
                for (let i = 0; i < responseText.length; i += chunkSize) {
                    chunks.push(responseText.slice(i, i + chunkSize));
                }

                try {
                    // Stream chunks with proper error handling and connection management
                    for (const chunk of chunks) {
                        if (!res.headersSent) {
                            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                            res.setHeader('Cache-Control', 'no-cache');
                            res.setHeader('Connection', 'keep-alive');
                            res.setHeader('Transfer-Encoding', 'chunked');
                        }
                        
                        res.write(chunk);
                        accumulatedContent += chunk;
                        
                        // Ensure chunk is sent immediately
                        if (res.flush) res.flush();
                        await new Promise(resolve => setTimeout(resolve, 20)); // Reduced delay for smoother streaming
                    }
                    
                    // Send an empty chunk to signal end of response
                    res.write('\n');
                    res.end();
                } catch (streamError) {
                    console.error('Error during streaming:', streamError);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Streaming failed' });
                    }
                }

                // Save the complete response to database
                await this.prisma.chatbotMessage.create({
                    data: {
                        conversation_id: chatId,
                        sender_type: 'BOT',
                        message: responseText,
                    },
                });
            } else {
                if (!res.headersSent) {
                    res.status(500).json({ error: 'No response from Gemini' });
                }
            }

        } catch (error: any) {
            console.error('Gemini API streaming error:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message,
            });

            if (!res.headersSent) {
                throw new Error(`Failed to get streaming response from Gemini: ${error.message}`);
            }
        }
    }

    async deleteChat(chatId: number, userId: number): Promise<void> {
        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                user_id: userId,
                model_type: this.getModelTypeForGemini(),
            },
        });
        
        if (!this.isGeminiChat(conversation)) {
            throw new Error('Gemini chat not found or you do not have permission to delete it');
        }

        // Delete all messages first (due to foreign key constraints)
        await this.prisma.chatbotMessage.deleteMany({
            where: { conversation_id: chatId },
        });

        // Then delete the conversation
        await this.prisma.chatbotConversation.delete({
            where: { id: chatId },
        });
    }

    async deleteAllChats(userId: number): Promise<number> {
        // Get all conversation IDs for this user (Gemini only)
        const conversations = await this.prisma.chatbotConversation.findMany({
            where: { 
                user_id: userId,
                model_type: this.getModelTypeForGemini()
            },
            select: { id: true },
        });

        const conversationIds = conversations.map(conv => conv.id);
        const count = conversationIds.length;

        if (conversationIds.length > 0) {
            // Delete all messages for all conversations
            await this.prisma.chatbotMessage.deleteMany({
                where: { conversation_id: { in: conversationIds } },
            });

            // Delete all conversations (Gemini only)
            await this.prisma.chatbotConversation.deleteMany({
                where: { 
                    user_id: userId,
                    model_type: this.getModelTypeForGemini()
                },
            });
        }

        return count;
    }
}