import { Controller, Post, Body, Param, Patch, Get, Delete, HttpException, HttpStatus, Req } from '@nestjs/common';
import { ChatCompetionMessageDto } from './dto/create-chat-completion.request';
import { LlamaService, LlamaChatMetadata } from './llama.service';
import { Auth } from '../common/decorators/auth.decorator';
import { RequestWithUser } from '../common/types/auth.types';

// Public health check controller (no auth required)
@Controller('llama')
export class LlamaPublicController {
    constructor(private readonly llamaService: LlamaService) { }

    @Get('health')
    async checkHealth() {
        return await this.llamaService.checkOllamaConnection();
    }
}

@Auth()
@Controller('llama/chat')
export class LlamaController {
    constructor(private readonly llamaService: LlamaService) { }

    @Post('create')
    async createChat(@Req() req: RequestWithUser, @Body('title') title?: string) {
        const chatId = await this.llamaService.createChat(req.user.id, title);
        return { chatId };
    }

    @Patch(':chatId/title')
    async updateTitle(@Param('chatId') chatId: string, @Body('title') title: string) {
        try {
            await this.llamaService.updateChatTitle(parseInt(chatId), title);
            return { chatId: parseInt(chatId), title };
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
            return await this.llamaService.addMessageAndGetCompletion(parseInt(chatId), message);
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.NOT_FOUND);
        }
    }

    @Post(':chatId/regenerate')
    async regenerate(@Param('chatId') chatId: string) {
        try {
            return await this.llamaService.regenerateLastResponse(parseInt(chatId));
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.NOT_FOUND);
        }
    }

    @Get(':chatId')
    async getChat(@Param('chatId') chatId: string, @Req() req: RequestWithUser): Promise<LlamaChatMetadata> {
        const chat = await this.llamaService.getChat(parseInt(chatId), req.user.id);
        if (!chat) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
        return chat;
    }

    @Get()
    async listChats(@Req() req: RequestWithUser) {
        return await this.llamaService.listChats(req.user.id);
    }

    @Delete('all')
    async deleteAllChats(@Req() req: RequestWithUser) {
        try {
            const deletedCount = await this.llamaService.deleteAllChats(req.user.id);
            return { success: true, message: `${deletedCount} chats deleted successfully` };
        } catch (e) {
            throw new HttpException(e.message || 'Failed to delete chats', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Delete(':chatId')
    async deleteChat(@Param('chatId') chatId: string, @Req() req: RequestWithUser) {
        try {
            await this.llamaService.deleteChat(parseInt(chatId), req.user.id);
            return { success: true, message: 'Chat deleted successfully' };
        } catch (e) {
            throw new HttpException(e.message || 'Chat not found', HttpStatus.NOT_FOUND);
        }
    }
}