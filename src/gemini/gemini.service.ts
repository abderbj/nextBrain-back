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

    // Try multiple RAG service base URLs (configured one, then host.docker.internal, 127.0.0.1, localhost)
    private async fetchRagContext(question: string, assistantCategoryId?: number): Promise<string> {
        if (!assistantCategoryId) return '';

        const tried: string[] = [];
        const bases = [] as string[];
        if (process.env.RAG_SERVICE_URL) bases.push(process.env.RAG_SERVICE_URL as string);
        bases.push('http://host.docker.internal:8001');
        bases.push('http://127.0.0.1:8001');
        bases.push('http://localhost:8001');

        const uniqueBases = Array.from(new Set(bases.map(b => b.replace(/\/$/, ''))));

        for (const base of uniqueBases) {
            const ragUrl = base.endsWith('/query') ? base : `${base}/query`;
            tried.push(ragUrl);
            try {
                console.log(`Trying RAG URL: ${ragUrl}`);
                const { data } = await axios.post(ragUrl, {
                    question,
                    limit: 5,
                    category_id: String(assistantCategoryId),
                }, { timeout: 3000 });

                if (data && Array.isArray(data.source_chunks) && data.source_chunks.length > 0) {
                    const chunks = data.source_chunks as Array<any>;
                    const uniqueMap = new Map<string | number, any>();
                    for (const c of chunks) {
                        const key = c.chunk_id ?? c.id ?? c.text;
                        if (!uniqueMap.has(key)) uniqueMap.set(key, c);
                    }
                    const uniqueChunks = Array.from(uniqueMap.values());

                    const MAX_CHUNKS = 5;
                    const MAX_CHARS = 4000;

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

                    const ragContext = selected.map((c: any, i: number) => `Chunk ${i + 1} (file: ${c.file_path ?? 'unknown'}): ${c.text}`).join('\n\n');
                    console.log(`RAG returned ${chunks.length} chunks from ${ragUrl}, using ${selected.length} unique chunks (${chars} chars)`);
                    return ragContext;
                }

                console.log(`RAG responded but returned 0 chunks from ${ragUrl}`);
                return '';
            } catch (err: any) {
                console.warn(`RAG request to ${ragUrl} failed: ${err?.message || String(err)}`);
            }
        }

        console.warn('All RAG endpoints tried and failed:', tried.join(', '));
        return '';
    }

    async createChat(userId: number, title = 'New Chat'): Promise<number> {
        const conversation = await this.prisma.chatbotConversation.create({
            data: {
                title,
                user_id: userId,
                model_type: ModelType.GEMINI,
            },
        });
        return conversation.id;
    }

    async updateChatTitle(chatId: number, title: string) {
        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                model_type: ModelType.GEMINI
            },
        });
        if (!conversation) throw new Error('Gemini chat not found');
        
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
        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                model_type: ModelType.GEMINI
            },
            include: {
                messages: {
                    orderBy: { sent_at: 'asc' },
                },
            },
        });
        
        if (!conversation) throw new Error('Gemini chat not found');

        // Set title from first user message if it's still "New Chat"
        if (
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

        // Convert messages to Gemini format
        const geminiMessages = allMessages.map(msg => ({
            role: msg.sender_type === 'USER' ? 'user' : 'model',
            parts: [{ text: msg.message }]
        }));

        // If we have ragContext, inject it as a system-like first message to guide Gemini
        if (ragContext) {
            geminiMessages.unshift({ role: 'system', parts: [{ text: `Use the following contextual chunks from the knowledge base to answer the user's question.\n\n${ragContext}` }] });
        }

        try {
            const { data } = await axios.post(
                `${this.baseUrl}?key=${this.apiKey}`,
                { contents: geminiMessages },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (responseText) {
                // Save AI response to database
                await this.prisma.chatbotMessage.create({
                    data: {
                        conversation_id: chatId,
                        sender_type: 'BOT',
                        message: responseText,
                    },
                });
                return { response: responseText };
            }
            return { response: null };
        } catch (error) {
            console.error('Gemini API error:', error.response?.data || error.message);
            throw new Error('Failed to get response from Gemini');
        }
    }

    async regenerateLastResponse(chatId: number, assistantCategoryId?: number): Promise<{ response: string | null }> {
        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                model_type: ModelType.GEMINI
            },
        });
        if (!conversation) throw new Error('Gemini chat not found');
        
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
            const { data } = await axios.post(
                `${this.baseUrl}?key=${this.apiKey}`,
                { contents: geminiMessages },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (responseText) {
                // Save new AI response to database
                await this.prisma.chatbotMessage.create({
                    data: {
                        conversation_id: chatId,
                        sender_type: 'BOT',
                        message: responseText,
                    },
                });
                return { response: responseText };
            }
            return { response: null };
        } catch (error) {
            console.error('Gemini API error:', error.response?.data || error.message);
            throw new Error('Failed to get response from Gemini');
        }
    }

    async getChat(chatId: number, userId: number): Promise<GeminiChatMetadata | null> {
        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                user_id: userId,
                model_type: ModelType.GEMINI
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
                model_type: ModelType.GEMINI
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

    async deleteChat(chatId: number, userId: number): Promise<void> {
        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                user_id: userId,
                model_type: ModelType.GEMINI,
            },
        });
        
        if (!conversation) {
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
                model_type: ModelType.GEMINI
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
                    model_type: ModelType.GEMINI
                },
            });
        }

        return count;
    }
}