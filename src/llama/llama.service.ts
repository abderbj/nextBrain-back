import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatCompetionMessageDto } from './dto/create-chat-completion.request';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { SenderType, ModelType } from '@prisma/client';
import { log } from 'node:console';

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

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
    ) {
        this.baseUrl = this.configService.get<string>('LLAMA_API_URL') || 'http://10.9.21.110:11434/api/chat';
        console.log('Llama service initialized with URL:', this.baseUrl);
    }

    async createChat(userId: number, title = 'New Chat'): Promise<number> {
        const conversation = await this.prisma.chatbotConversation.create({
            data: {
                title,
                user_id: userId,
                model_type: ModelType.LLAMA,
            },
        });
        return conversation.id;
    }

    async updateChatTitle(chatId: number, title: string) {
        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                model_type: ModelType.LLAMA
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
        message: ChatCompetionMessageDto
    ): Promise<{ response: string | null }> {
        const conversation = await this.prisma.chatbotConversation.findFirst({
            where: { 
                id: chatId,
                model_type: ModelType.LLAMA
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

        try {
            console.log('Sending request to Llama API:', this.baseUrl);
            console.log('Request payload:', {
                model: 'steamdj/llama3.1-cpu-only:latest',
                messages: llamaMessages,
                stream: false,
            });
            
            // Send all messages to Llama
            const response = await axios.post(this.baseUrl, {
                model: 'steamdj/llama3.1-cpu-only:latest',
                messages: llamaMessages,
                stream: false,
            }, {
                timeout: 30000, // 30 second timeout
                headers: {
                    'Content-Type': 'application/json',
                }
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
            
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                throw new Error(`Cannot connect to Ollama at ${this.baseUrl}. Make sure Ollama is running and accessible.`);
            }
            
            throw new Error(`Failed to get response from Llama: ${error.message}`);
        }
    }

    // Regenerate last assistant response
    async regenerateLastResponse(chatId: number): Promise<{ response: string | null }> {
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

        try {
            console.log('Regenerating response - sending request to Llama API:', this.baseUrl);
            // Re-send to Llama
            const response = await axios.post(this.baseUrl, {
                model: 'llama3.2:latest',
                messages: llamaMessages,
                stream: false,
            }, {
                timeout: 30000, // 30 second timeout
                headers: {
                    'Content-Type': 'application/json',
                }
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
                model_type: ModelType.LLAMA
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
                model_type: ModelType.LLAMA,
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
                model_type: ModelType.LLAMA
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
                    model_type: ModelType.LLAMA
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
            
            // Check if llama3.2 is available
            const models = modelsResponse.data.models || [];
            const llamaModel = models.find(model => model.name.includes('llama3.2'));
            
            if (!llamaModel) {
                return {
                    status: 'warning',
                    message: 'Connected to Ollama but llama3.2 model not found. Available models: ' + 
                            models.map(m => m.name).join(', '),
                    url: this.baseUrl
                };
            }
            
            return {
                status: 'success',
                message: 'Successfully connected to Ollama and llama3.2 model is available',
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