import { Controller, Post, Body, Param, Patch, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ChatCompetionMessageDto } from './dto/create-chat-completion.request';
import { LlamaService, LlamaChatMetadata } from './llama.service';

@Controller('llama')
export class LlamaController {
    constructor(private readonly llamaService: LlamaService) { }

    @Post('create')
    createChat(@Body('title') title?: string) {
        const chatId = this.llamaService.createChat(title);
        return { chatId };
    }

    @Patch(':chatId/title')
    updateTitle(@Param('chatId') chatId: string, @Body('title') title: string) {
        try {
            this.llamaService.updateChatTitle(chatId, title);
            return { chatId, title };
        } catch (e) {
            throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
        }
    }

    @Post(':chatId/message')
    async sendMessage(
        @Param('chatId') chatId: string,
        @Body() message: ChatCompetionMessageDto
    ) {
        if (!message || typeof message.role !== 'string' || typeof message.content !== 'string' || !message.content.trim()) {
            throw new HttpException('Invalid message: role and content are required.', HttpStatus.BAD_REQUEST);
        }

        try {
            return await this.llamaService.addMessageAndGetCompletion(chatId, message);
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.NOT_FOUND);
        }
    }


    @Post(':chatId/regenerate')
    async regenerate(@Param('chatId') chatId: string) {
        try {
            return await this.llamaService.regenerateLastResponse(chatId);
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.NOT_FOUND);
        }
    }

    @Get(':chatId')
    getChat(@Param('chatId') chatId: string): LlamaChatMetadata {
        const chat = this.llamaService.getChat(chatId);
        if (!chat) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
        return chat;
    }

    @Get()
    listChats() {
        return this.llamaService.listChats();
    }
}