import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ChatCompletionMessageDto } from './dto/create-chat-completion.request';
import { PrismaService } from '../prisma/prisma.service';
import { SenderType } from '@prisma/client';

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

    async createChat(userId: number, title = 'New Chat'): Promise<number> {
        const conversation = await this.prisma.chatbotConversation.create({
            data: {
                title,
                user_id: userId,
            },
        });
        return conversation.id;
    }

    async updateChatTitle(chatId: number, title: string) {
        const conversation = await this.prisma.chatbotConversation.findUnique({
            where: { id: chatId },
        });
        if (!conversation) throw new Error('Chat not found');
        
        await this.prisma.chatbotConversation.update({
            where: { id: chatId },
            data: { title },
        });
    }

    async addMessageAndGetCompletion(
        chatId: number,
        message: ChatCompletionMessageDto
    ): Promise<{ response: string | null }> {
        const conversation = await this.prisma.chatbotConversation.findUnique({
            where: { id: chatId },
            include: {
                messages: {
                    orderBy: { sent_at: 'asc' },
                },
            },
        });
        
        if (!conversation) throw new Error('Chat not found');

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

        // Convert messages to Gemini format
        const geminiMessages = allMessages.map(msg => ({
            role: msg.sender_type === 'USER' ? 'user' : 'model',
            parts: [{ text: msg.message }]
        }));

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

    async regenerateLastResponse(chatId: number): Promise<{ response: string | null }> {
        const conversation = await this.prisma.chatbotConversation.findUnique({
            where: { id: chatId },
        });
        if (!conversation) throw new Error('Chat not found');
        
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

        // Convert messages to Gemini format
        const geminiMessages = allMessages.map(msg => ({
            role: msg.sender_type === 'USER' ? 'user' : 'model',
            parts: [{ text: msg.message }]
        }));

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

    async getChat(chatId: number): Promise<GeminiChatMetadata | null> {
        const conversation = await this.prisma.chatbotConversation.findUnique({
            where: { id: chatId },
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
            where: { user_id: userId },
            orderBy: { updated_at: 'desc' },
        });
        
        return conversations.map(conversation => ({
            id: conversation.id,
            title: conversation.title,
            createdAt: conversation.started_at,
            updatedAt: conversation.updated_at,
        }));
    }
}