import { Controller, Post, Body, Param, Patch, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ChatCompletionMessageDto } from './dto/create-chat-completion.request';
import { GeminiService, GeminiChatMetadata } from './gemini.service';

@Controller('gemini/chat')
export class GeminiController {
    constructor(private readonly geminiService: GeminiService) {}

    @Post('create')
    createChat(@Body('title') title?: string) {
        const chatId = this.geminiService.createChat(title);
        return { chatId };
    }

    @Patch(':chatId/title')
    updateTitle(@Param('chatId') chatId: string, @Body('title') title: string) {
        try {
            this.geminiService.updateChatTitle(chatId, title);
            return { chatId, title };
        } catch (e) {
            throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
        }
    }

    @Post(':chatId/message')
    async sendMessage(
        @Param('chatId') chatId: string,
        @Body() body: { messages: ChatCompletionMessageDto[] }
    ) {
        console.log('Received body:', body);
        
        if (!body || !body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
            throw new HttpException('Request body must have a non-empty "messages" array', HttpStatus.BAD_REQUEST);
        }

        // Get the last message (latest user input)
        const lastMessage = body.messages[body.messages.length - 1];
        
        if (!lastMessage || typeof lastMessage.role !== 'string' || typeof lastMessage.content !== 'string' || !lastMessage.content.trim()) {
            throw new HttpException('Invalid message: role and content are required.', HttpStatus.BAD_REQUEST);
        }

        try {
            return await this.geminiService.addMessageAndGetCompletion(chatId, lastMessage);
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.NOT_FOUND);
        }
    }

    @Post(':chatId/regenerate')
    async regenerate(@Param('chatId') chatId: string) {
        try {
            return await this.geminiService.regenerateLastResponse(chatId);
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.NOT_FOUND);
        }
    }

    @Get(':chatId')
    getChat(@Param('chatId') chatId: string): GeminiChatMetadata {
        const chat = this.geminiService.getChat(chatId);
        if (!chat) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
        return chat;
    }

    @Get()
    listChats() {
        return this.geminiService.listChats();
    }
}