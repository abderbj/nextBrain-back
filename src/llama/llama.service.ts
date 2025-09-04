import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatCompetionMessageDto } from './dto/create-chat-completion.request';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { SenderType, ModelType } from '@prisma/client';
import { log } from 'node:console';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface LlamaChatMetadata {
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
export class LlamaService {
    private readonly baseUrl: string;
    private model: string;

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
    ) {
    this.baseUrl = this.configService.get<string>('LLAMA_API_URL') || 'http://10.9.21.110:11434/api/chat';
    // Determine model: prefer explicit env override, then detect from docker-compose files, then default to a real local model
    // Supported local model names include: 'mistral:7b', 'gemma:7b', 'deepseek-coder:6.7b' (client may pass any of these in the ?model= query)
    this.model = this.configService.get<string>('LLAMA_MODEL') || this.detectModelFromCompose() || 'mistral:7b';
    console.log('LLM gateway initialized with URL:', this.baseUrl, 'default model:', this.model);
    }

    private detectModelFromCompose(): string | null {
        try {
            const cwd = process.cwd();
            const candidates = [
                join(cwd, 'docker-compose.dev.yml'),
                join(cwd, 'docker-compose.yml')
            ];

            for (const filePath of candidates) {
                if (!existsSync(filePath)) continue;
                const content = readFileSync(filePath, 'utf8');

                // Look for known model strings and map them to the real Ollama tag names we use
                if (/mistral[:\/]?7b/i.test(content) || /mistral/i.test(content)) {
                    return 'mistral:7b';
                }

                if (/gemma[:\/]?7b/i.test(content) || /gemma/i.test(content)) {
                    return 'gemma:7b';
                }

                if (/deepseek[:\-]?coder[:\/]?6\.7b/i.test(content) || /deepseek/i.test(content)) {
                    return 'deepseek-coder:6.7b';
                }

                // Fallback: keep older llama detection for compatibility
                if (/steamdj\/llama3\.1(-cpu-only)?/i.test(content) || /steamdj\/llama3\.1-cpu-only/i.test(content)) {
                    return 'steamdj/llama3.1-cpu-only:latest';
                }

                if (/llama3\.2/i.test(content)) {
                    return 'llama3.2';
                }
            }
        } catch (e) {
            // ignore and fallback
        }
        return null;
    }

    private async ensureModelAvailable(): Promise<boolean> {
        // Returns true if a fallback to llama3.2 was performed
        try {
            const modelsUrl = this.baseUrl.replace('/api/chat', '/api/tags');
            const modelsResponse = await axios.get(modelsUrl, { timeout: 5000 });
            const models = modelsResponse.data.models || modelsResponse.data || [];

            const names: string[] = models.map((m: any) => (m && m.name) ? m.name : String(m));

            // If current model present, nothing to do
            if (names.find(n => n.includes(this.model))) return false;

            // Prefer llama3.2 if available
            const found32 = names.find(n => /llama3\.2/i.test(n));
            if (found32) {
                console.warn(`Model ${this.model} not found on Ollama; falling back to ${found32}`);
                this.model = found32.includes(':') ? found32 : 'llama3.2';
                return true;
            }

            return false;
        } catch (e) {
            // If we can't fetch tags, don't change model
            return false;
        }
    }

    // Check whether a specific model name is available on Ollama
    private async isModelAvailableOnOllama(name: string): Promise<boolean> {
        try {
            const modelsUrl = this.baseUrl.replace('/api/chat', '/api/tags');
            const modelsResponse = await axios.get(modelsUrl, { timeout: 5000 });
            const models = modelsResponse.data.models || modelsResponse.data || [];
            const names: string[] = models.map((m: any) => (m && m.name) ? m.name : String(m));
            return Boolean(names.find(n => n.includes(name) || n === name));
        } catch (e) {
            return false;
        }
    }

    // Ensure that the requested model is available; if not, try to fallback using existing logic.
    // Returns the model name that should be used (either the requested one, or this.model after fallback)
    private async ensureModelAvailableFor(requestedModel: string): Promise<string> {
        try {
            if (await this.isModelAvailableOnOllama(requestedModel)) return requestedModel;

            // Requested model not found; try to let ensureModelAvailable pick a fallback (it mutates this.model)
            await this.ensureModelAvailable();
            return this.model;
        } catch (e) {
            return this.model;
        }
    }

    // Try multiple RAG service base URLs (configured one, then host.docker.internal, 127.0.0.1, localhost)
    // Returns concatenated chunk text or empty string on failure.
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
                console.log(`Trying RAG URL: ${ragUrl}`);
                const { data } = await axios.post(ragUrl, {
                    question,
                    limit: 5,
                    category_id: String(assistantCategoryId),
                }, { timeout: 3000 });

                if (data && Array.isArray(data.source_chunks) && data.source_chunks.length > 0) {
                    // Deduplicate by chunk_id (or fallback to text) and limit total size to avoid overwhelming the model
                    const chunks = data.source_chunks as Array<any>;
                    const uniqueMap = new Map<string | number, any>();
                    for (const c of chunks) {
                        const key = c.chunk_id ?? c.id ?? c.text;
                        if (!uniqueMap.has(key)) uniqueMap.set(key, c);
                    }
                    const uniqueChunks = Array.from(uniqueMap.values());

                    const MAX_CHUNKS = 5; // take top-N chunks
                    const MAX_CHARS = 4000; // cap combined characters

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

                // If we got a successful response but no chunks, return empty so caller can continue
                console.log(`RAG responded but returned 0 chunks from ${ragUrl}`);
                return '';
            } catch (err: any) {
                // Connection refused / not found - try next base
                const msg = err?.message || String(err);
                console.warn(`RAG request to ${ragUrl} failed: ${msg}`);
                // continue to next candidate
            }
        }

        console.warn('All RAG endpoints tried and failed:', tried.join(', '));
        return '';
    }

    async createChat(userId: number, title = 'New Chat', requestedModel?: string): Promise<number> {
        // Map requestedModel string to ModelType enum where possible
    let modelType: ModelType = ModelType.LLAMA;
        if (requestedModel) {
            const r = requestedModel.toLowerCase();
            if (r.includes('gemini')) modelType = ModelType.GEMINI;
            else if (r.includes('mistral')) modelType = ModelType.MISTRAL;
            else if (r.includes('gemma')) modelType = ModelType.GEMMA;
            else if (r.includes('deepseek')) modelType = ModelType.DEEPSEEK;
            else modelType = ModelType.LLAMA;
        }

        const conversation = await this.prisma.chatbotConversation.create({
            data: {
                title,
                user_id: userId,
                model_type: modelType,
            },
        });
        return conversation.id;
    }

    // Model selection is provided per-request via query param; conversations keep ModelType only

    async updateChatTitle(chatId: number, title: string) {
        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                model_type: { in: [ModelType.LLAMA, ModelType.MISTRAL, ModelType.GEMMA, ModelType.DEEPSEEK] }
            },
        });
        if (!conversation) throw new Error('Llama chat not found');
        
        await this.prisma.chatbotConversation.update({
            where: { id: chatId },
            data: { title },
        });
    }

    async addMessageAndGetCompletion(
        chatId: number,
        message: ChatCompetionMessageDto,
        assistantCategoryId?: number,
        requestedModel?: string,
    ): Promise<{ response: string | null }> {
    const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                model_type: { in: [ModelType.LLAMA, ModelType.MISTRAL, ModelType.GEMMA, ModelType.DEEPSEEK] }
            },
            include: {
                messages: {
                    orderBy: { sent_at: 'asc' },
                },
            },
        });
        
        if (!conversation) throw new Error('Llama chat not found');

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

        // Get all messages for context and prepare for Llama
        const allMessages = await this.prisma.chatbotMessage.findMany({
            where: { conversation_id: chatId },
            orderBy: { sent_at: 'asc' },
        });

    // If assistantCategoryId is provided, query RAG service for context using resilient helper
    const ragContext = await this.fetchRagContext(message.content, assistantCategoryId);

        // Add system message if this is the first message and convert to Llama format
        const llamaMessages: Array<{ role: string; content: string }> = [];
        if (allMessages.length === 1) {
            llamaMessages.push({
                role: 'system',
                content: 'You are a helpful assistant. Answer clearly and concisely.',
            });
        }

        // Convert messages to Llama format
        llamaMessages.push(...allMessages.map(msg => ({
            role: msg.sender_type === 'USER' ? 'user' : 'assistant',
            content: msg.message
        })));

        // If we have ragContext, prepend it as a system message to guide the model
        if (ragContext) {
            llamaMessages.unshift({ role: 'system', content: `Use the following contextual chunks from the knowledge base to answer the user's question:\n\n${ragContext}` });
        }

        // Determine the model to use: prefer requestedModel (query param), then configured env model, then service default
    const modelToUse = requestedModel || this.configService.get<string>('LLAMA_MODEL') || this.model;

        // If client requested Gemini, instruct to use the Gemini endpoint (keep services independent)
        if (typeof modelToUse === 'string' && modelToUse.toLowerCase().includes('gemini')) {
            throw new Error('Requested model is Gemini — call the /gemini endpoints instead of /llama to use Gemini.');
        }

        // Prepare request headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        try {
            console.log('Sending request to Llama API:', this.baseUrl);
            console.log('Using model:', modelToUse);
            console.log('Request payload sample:', {
                model: modelToUse,
                messages: llamaMessages,
                stream: false,
            });

            // Ensure requested model is available or get a fallback model
            const finalModel = await this.ensureModelAvailableFor(modelToUse);

            // Send all messages to Llama using the final model
            const response = await axios.post(this.baseUrl, {
                model: finalModel,
                messages: llamaMessages,
                stream: false,
            }, {
                timeout: 60000, // Increased to 60 seconds for non-streaming
                headers
            });

            const aiMessage = response.data.message;
            log('Llama response:', aiMessage);
            if (aiMessage && aiMessage.content) {
                // Save AI response to database
                await this.prisma.chatbotMessage.create({
                    data: {
                        conversation_id: chatId,
                        sender_type: 'BOT',
                        message: aiMessage.content,
                    },
                });
                return { response: aiMessage.content };
            }
            return { response: null };
        } catch (error) {
            console.error('Llama API error details (addMessageAndGetCompletion):');
            console.error('- URL:', this.baseUrl);
            console.error('- Error message:', error.message);
            console.error('- Error code:', error.code);
            console.error('- Response status:', error.response?.status);
            console.error('- Response data:', error.response?.data);

            // If Ollama indicates the model is not found, try to fallback to llama3.2 once
            const respData: any = error.response?.data;
            if (error.response?.status === 404 && respData && typeof respData.error === 'string' && respData.error.includes('model')) {
                const didFallback = await this.ensureModelAvailable();
                if (didFallback) {
                    // Retry the request once with the fallback model
                    try {
                        const retryResp = await axios.post(this.baseUrl, {
                            model: this.model,
                            messages: llamaMessages,
                            stream: false,
                        }, { timeout: 60000, headers });

                        const aiMessageRetry = retryResp.data.message;
                        if (aiMessageRetry && aiMessageRetry.content) {
                            await this.prisma.chatbotMessage.create({
                                data: {
                                    conversation_id: chatId,
                                    sender_type: 'BOT',
                                    message: aiMessageRetry.content,
                                },
                            });
                            return { response: aiMessageRetry.content };
                        }
                        return { response: null };
                    } catch (retryErr) {
                        console.error('Retry after fallback failed:', retryErr.message);
                    }
                }
            }

            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                throw new Error(`Cannot connect to Ollama at ${this.baseUrl}. Make sure Ollama is running and accessible.`);
            }

            throw new Error(`Failed to get response from Llama: ${error.message}`);
        }
    }

    async addMessageAndGetCompletionStream(
        chatId: number,
        message: ChatCompetionMessageDto,
        res: any,
        assistantCategoryId?: number,
        requestedModel?: string,
    ): Promise<void> {
        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                model_type: { in: [ModelType.LLAMA, ModelType.MISTRAL, ModelType.GEMMA, ModelType.DEEPSEEK] }
            },
            include: {
                messages: {
                    orderBy: { sent_at: 'asc' },
                },
            },
        });
        
        if (!conversation) throw new Error('Llama chat not found');

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

        // Get all messages for context and prepare for Llama
        const allMessages = await this.prisma.chatbotMessage.findMany({
            where: { conversation_id: chatId },
            orderBy: { sent_at: 'asc' },
        });

    // If assistantCategoryId is provided, query RAG service for context using resilient helper
    const ragContext = await this.fetchRagContext(message.content, assistantCategoryId);

        // Add system message if this is the first message and convert to Llama format
        const llamaMessages: Array<{ role: string; content: string }> = [];
        if (allMessages.length === 1) {
            llamaMessages.push({
                role: 'system',
                content: 'You are a helpful assistant. Answer clearly and concisely.',
            });
        }

        // Convert messages to Llama format
        llamaMessages.push(...allMessages.map(msg => ({
            role: msg.sender_type === 'USER' ? 'user' : 'assistant',
            content: msg.message
        })));

        // If we have ragContext, prepend it as a system message to guide the model
        if (ragContext) {
            llamaMessages.unshift({ role: 'system', content: `Use the following contextual chunks from the knowledge base to answer the user's question:\n\n${ragContext}` });
        }

        let accumulatedContent = '';

        // Prepare headers and response holder so retry logic can reuse them
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        let response: any;

    // Determine model for streaming requests (prefer requestedModel)
    const modelToUseStream = requestedModel || this.configService.get<string>('LLAMA_MODEL') || this.model;

        try {
            console.log('Sending streaming request to Llama API:', this.baseUrl);
            console.log('Using model for stream:', modelToUseStream);

            // If requested model is Gemini, instruct caller to use Gemini endpoints (service separation)
            if (typeof modelToUseStream === 'string' && modelToUseStream.toLowerCase().includes('gemini')) {
                res.status(400).json({ error: 'Requested model is Gemini — use /gemini endpoints for Gemini models' });
                return;
            }

            // Ensure requested model is available or get a fallback
            const finalModelForStream = await this.ensureModelAvailableFor(modelToUseStream);

            // Send streaming request to Llama
            response = await axios.post(this.baseUrl, {
                model: finalModelForStream,
                messages: llamaMessages,
                stream: true,
            }, {
                timeout: 0, // No timeout for streaming
                responseType: 'stream',
                headers
            });
            
            // Process the streaming response
            response.data.on('data', (chunk: Buffer) => {
                const lines = chunk.toString().split('\n');
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const data = JSON.parse(line);
                            if (data.message && data.message.content) {
                                const content = data.message.content;
                                accumulatedContent += content;
                                
                                // Stream the content to the client
                                res.write(content);
                            }
                            
                            // Check if the response is done
                            if (data.done) {
                                console.log('Streaming complete');
                                res.end();
                                
                                // Save the complete AI response to database
                                if (accumulatedContent) {
                                    this.prisma.chatbotMessage.create({
                                        data: {
                                            conversation_id: chatId,
                                            sender_type: 'BOT',
                                            message: accumulatedContent,
                                        },
                                    }).catch(error => {
                                        console.error('Failed to save message to database:', error);
                                    });
                                }
                                return;
                            }
                        } catch (parseError) {
                            console.warn('Failed to parse streaming chunk:', line);
                        }
                    }
                }
            });
            
            response.data.on('end', () => {
                console.log('Stream ended');
                if (!res.headersSent) {
                    res.end();
                }
                
                // Save the complete AI response to database if not already saved
                if (accumulatedContent) {
                    this.prisma.chatbotMessage.findFirst({
                        where: {
                            conversation_id: chatId,
                            sender_type: 'BOT',
                            message: accumulatedContent,
                        },
                    }).then(existingMessage => {
                        if (!existingMessage) {
                            return this.prisma.chatbotMessage.create({
                                data: {
                                    conversation_id: chatId,
                                    sender_type: 'BOT',
                                    message: accumulatedContent,
                                },
                            });
                        }
                    }).catch(error => {
                        console.error('Failed to save message to database:', error);
                    });
                }
            });
            
            response.data.on('error', (error: any) => {
                console.error('Stream error:', error);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Streaming failed' });
                }
            });
            
        } catch (error) {
            console.error('Llama API streaming error:');
            console.error('- URL:', this.baseUrl);
            console.error('- Error message:', error.message);
            console.error('- Error code:', error.code);
            console.error('- Response status:', error.response?.status);
            console.error('- Response data:', error.response?.data);
            // If Ollama indicates the model is not found, try to fallback to llama3.2 once and retry
            const respData: any = error.response?.data;
            if (error.response?.status === 404 && respData && typeof respData.error === 'string' && respData.error.includes('model')) {
                // Try to ensure the requested model or fallback before retry
                const fallbackModel = await this.ensureModelAvailableFor(modelToUseStream);
                if (fallbackModel) {
                    try {
                        response = await axios.post(this.baseUrl, {
                            model: fallbackModel,
                            messages: llamaMessages,
                            stream: true,
                        }, { timeout: 0, responseType: 'stream', headers });

                        // attach new stream handlers to the new response
                        response.data.on('data', (chunk: Buffer) => {
                            const lines = chunk.toString().split('\n');
                            for (const line of lines) {
                                if (line.trim()) {
                                    try {
                                        const data = JSON.parse(line);
                                        if (data.message && data.message.content) {
                                            const content = data.message.content;
                                            accumulatedContent += content;
                                            res.write(content);
                                        }
                                        if (data.done) {
                                            res.end();
                                            if (accumulatedContent) {
                                                this.prisma.chatbotMessage.create({
                                                    data: {
                                                        conversation_id: chatId,
                                                        sender_type: 'BOT',
                                                        message: accumulatedContent,
                                                    },
                                                }).catch(e=>console.error('Failed to save message after fallback:', e));
                                            }
                                            return;
                                        }
                                    } catch (parseError) {
                                        console.warn('Failed to parse streaming chunk after fallback:', line);
                                    }
                                }
                            }
                        });

                        response.data.on('end', () => {
                            if (!res.headersSent) res.end();
                        });

                        response.data.on('error', (err: any) => {
                            console.error('Stream error after fallback:', err);
                            if (!res.headersSent) res.status(500).json({ error: 'Streaming failed after fallback' });
                        });

                        return;
                    } catch (retryErr) {
                        console.error('Streaming retry after fallback failed:', retryErr.message);
                    }
                }
            }

            if (!res.headersSent) {
                if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                    res.status(500).json({ 
                        error: `Cannot connect to Ollama at ${this.baseUrl}. Make sure Ollama is running and accessible.` 
                    });
                } else {
                    res.status(500).json({ 
                        error: `Failed to get response from Llama: ${error.message}` 
                    });
                }
            }
        }
    }

    // Regenerate last assistant response
    async regenerateLastResponse(chatId: number, assistantCategoryId?: number, requestedModel?: string): Promise<{ response: string | null }> {
        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                model_type: ModelType.LLAMA
            },
        });
        if (!conversation) throw new Error('Llama chat not found');
        
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

    // If assistantCategoryId is provided, query RAG service for context using resilient helper
    const ragContext = await this.fetchRagContext(allMessages.map(m => m.message).join('\n'), assistantCategoryId);

        // Prepare messages for Llama
        const llamaMessages: Array<{ role: string; content: string }> = [];
        if (allMessages.length > 0) {
            llamaMessages.push({
                role: 'system',
                content: 'You are a helpful assistant. Answer clearly and concisely.',
            });
        }

        // Convert messages to Llama format
        llamaMessages.push(...allMessages.map(msg => ({
            role: msg.sender_type === 'USER' ? 'user' : 'assistant',
            content: msg.message
        })));

        if (ragContext) {
            llamaMessages.unshift({ role: 'system', content: `Use the following contextual chunks from the knowledge base to answer the user's question:\n\n${ragContext}` });
        }

        try {
            console.log('Regenerating response - sending request to Llama API:', this.baseUrl);
            // Determine requested model (query param) and ensure availability
            const modelToUse = requestedModel || this.configService.get<string>('LLAMA_MODEL') || this.model;

            // If client wants Gemini, instruct them to call the Gemini endpoints
            if (typeof modelToUse === 'string' && modelToUse.toLowerCase().includes('gemini')) {
                throw new Error('Requested model is Gemini — call the /gemini endpoints to regenerate Gemini responses.');
            }

            const finalModel = await this.ensureModelAvailableFor(modelToUse);

            // Re-send to Llama
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            const response = await axios.post(this.baseUrl, {
                model: finalModel,
                messages: llamaMessages,
                stream: false,
            }, {
                timeout: 60000, // Increased to 60 seconds
                headers
            });

            const aiMessage = response.data.message;
            if (aiMessage && aiMessage.content) {
                // Save new AI response to database
                await this.prisma.chatbotMessage.create({
                    data: {
                        conversation_id: chatId,
                        sender_type: 'BOT',
                        message: aiMessage.content,
                    },
                });
                return { response: aiMessage.content };
            }
            return { response: null };
        } catch (error) {
            console.error('Llama API error details (regenerateLastResponse):');
            console.error('- URL:', this.baseUrl);
            console.error('- Error message:', error.message);
            console.error('- Error code:', error.code);
            console.error('- Response status:', error.response?.status);
            console.error('- Response data:', error.response?.data);
            
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                throw new Error(`Cannot connect to Ollama at ${this.baseUrl}. Make sure Ollama is running and accessible.`);
            }
            
            throw new Error(`Failed to get response from Llama: ${error.message}`);
        }
    }

    async getChat(chatId: number, userId: number): Promise<LlamaChatMetadata | null> {
        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                user_id: userId,
                model_type: ModelType.LLAMA
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
                model_type: { in: [ModelType.LLAMA, ModelType.MISTRAL, ModelType.GEMMA, ModelType.DEEPSEEK] }
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
                model_type: { in: [ModelType.LLAMA, ModelType.MISTRAL, ModelType.GEMMA, ModelType.DEEPSEEK] }
            },
        });
        
        if (!conversation) {
            throw new Error('Llama chat not found or you do not have permission to delete it');
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
        // Get all conversation IDs for this user (Llama only)
        const conversations = await this.prisma.chatbotConversation.findMany({
            where: { 
                user_id: userId,
                model_type: { in: [ModelType.LLAMA, ModelType.MISTRAL, ModelType.GEMMA, ModelType.DEEPSEEK] }
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

            // Delete all conversations (Llama only)
            await this.prisma.chatbotConversation.deleteMany({
                where: { 
                    user_id: userId,
                    model_type: { in: [ModelType.LLAMA, ModelType.MISTRAL, ModelType.GEMMA, ModelType.DEEPSEEK] }
                },
            });
        }

        return count;
    }

    async checkOllamaConnection(): Promise<{ status: string; message: string; url: string }> {
        try {
            console.log('Testing connection to Ollama at:', this.baseUrl);
            
            // Try to get available models first
            const modelsUrl = this.baseUrl.replace('/api/chat', '/api/tags');
            const modelsResponse = await axios.get(modelsUrl, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            console.log('Available models:', modelsResponse.data);
            
            // Check if steamdj/llama3.1-cpu-only is available
            const models = modelsResponse.data.models || [];
            const llamaModel = models.find(model => model.name.includes('steamdj/llama3.1-cpu-only'));
            
            if (!llamaModel) {
                return {
                    status: 'warning',
                    message: 'Connected to Ollama but steamdj/llama3.1-cpu-only model not found. Available models: ' + 
                            models.map(m => m.name).join(', '),
                    url: this.baseUrl
                };
            }
            
            return {
                status: 'success',
                message: 'Successfully connected to Ollama and steamdj/llama3.1-cpu-only model is available',
                url: this.baseUrl
            };
            
        } catch (error) {
            console.error('Ollama connection test failed:', error.message);
            
            let errorMessage = `Failed to connect to Ollama at ${this.baseUrl}`;
            
            if (error.code === 'ECONNREFUSED') {
                errorMessage += ' - Connection refused. Is Ollama running?';
            } else if (error.code === 'ENOTFOUND') {
                errorMessage += ' - Host not found. Check the URL.';
            } else if (error.code === 'ETIMEDOUT') {
                errorMessage += ' - Connection timed out. Check network connectivity.';
            } else {
                errorMessage += ` - ${error.message}`;
            }
            
            return {
                status: 'error',
                message: errorMessage,
                url: this.baseUrl
            };
        }
    }
}