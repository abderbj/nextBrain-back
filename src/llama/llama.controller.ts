import { Controller, Post, Body, Param, Patch, Get, Delete, HttpException, HttpStatus, Req, Res } from '@nestjs/common';
import { ChatCompetionMessageDto } from './dto/create-chat-completion.request';
import { LlamaService, LlamaChatMetadata } from './llama.service';
import { Auth } from '../common/decorators/auth.decorator';
import { RequestWithUser } from '../common/types/auth.types';

@Controller('llama')
export class LlamaController {
    constructor(private readonly llamaService: LlamaService) { }

    // Public health check endpoint (no auth required)
    @Get('health')
    async checkHealth() {
        return await this.llamaService.checkOllamaConnection();
    }

    // All chat endpoints require authentication
    @Auth()
    @Post('chat/create')
    async createChat(@Req() req: RequestWithUser, @Body('title') title?: string) {
        const chatId = await this.llamaService.createChat(req.user.id, title);
        return { chatId };
    }

    @Auth()
    @Patch('chat/:chatId/title')
    async updateTitle(@Param('chatId') chatId: string, @Body('title') title: string) {
        try {
            await this.llamaService.updateChatTitle(parseInt(chatId), title);
            return { chatId: parseInt(chatId), title };
        } catch (e) {
            throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
        }
    }

    @Auth()
    @Post('chat/:chatId/message')
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

    @Auth()
    @Post('chat/:chatId/message/stream')
    async sendMessageStream(
        @Param('chatId') chatId: string,
        @Body() message: ChatCompetionMessageDto,
        @Req() req: any,
        @Res() res: any
    ) {
        if (!message || typeof message.role !== 'string' || typeof message.content !== 'string' || !message.content.trim()) {
            throw new HttpException('Invalid message: role and content are required.', HttpStatus.BAD_REQUEST);
        }

        try {
            // Set headers for Server-Sent Events
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

            await this.llamaService.addMessageAndGetCompletionStream(parseInt(chatId), message, res);
        } catch (e) {
            if (!res.headersSent) {
                throw new HttpException(e.message, HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }
    }

    @Auth()
    @Post('chat/:chatId/regenerate')
    async regenerate(@Param('chatId') chatId: string) {
        try {
            return await this.llamaService.regenerateLastResponse(parseInt(chatId));
        } catch (e) {
            throw new HttpException(e.message, HttpStatus.NOT_FOUND);
        }
    }

    @Auth()
    @Get('chat/:chatId')
    async getChat(@Param('chatId') chatId: string, @Req() req: RequestWithUser): Promise<LlamaChatMetadata> {
        const chat = await this.llamaService.getChat(parseInt(chatId), req.user.id);
        if (!chat) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
        return chat;
    }

    @Auth()
    @Get('chat')
    async listChats(@Req() req: RequestWithUser) {
        return await this.llamaService.listChats(req.user.id);
    }

    @Auth()
    @Delete('chat/all')
    async deleteAllChats(@Req() req: RequestWithUser) {
        try {
            const deletedCount = await this.llamaService.deleteAllChats(req.user.id);
            return { success: true, message: `${deletedCount} chats deleted successfully` };
        } catch (e) {
            throw new HttpException(e.message || 'Failed to delete chats', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Auth()
    @Delete('chat/:chatId')
    async deleteChat(@Param('chatId') chatId: string, @Req() req: RequestWithUser) {
        try {
            await this.llamaService.deleteChat(parseInt(chatId), req.user.id);
            return { success: true, message: 'Chat deleted successfully' };
        } catch (e) {
            throw new HttpException(e.message || 'Chat not found', HttpStatus.NOT_FOUND);
        }
    }
}