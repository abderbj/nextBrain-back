import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatCompetionMessageDto } from './dto/create-chat-completion.request';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { SenderType, ModelType } from '@prisma/client';

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
        this.baseUrl = this.configService.get<string>('LLAMA_API_URL') || 'http://localhost:11434/api/chat';
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
            // Send all messages to Llama
            const response = await axios.post(this.baseUrl, {
                model: 'llama3.2',
                messages: llamaMessages,
                stream: false,
            });

            const aiMessage = response.data.message;
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
            console.error('Llama API error:', error.response?.data || error.message);
            throw new Error('Failed to get response from Llama');
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
            // Re-send to Llama
            const response = await axios.post(this.baseUrl, {
                model: 'llama3.2',
                messages: llamaMessages,
                stream: false,
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
            console.error('Llama API error:', error.response?.data || error.message);
            throw new Error('Failed to get response from Llama');
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
}