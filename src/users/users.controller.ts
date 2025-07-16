import {
  Body,
  UploadedFile,
  Req,
  Patch,
  UseInterceptors,
  Delete,
  Get,
  Controller,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateAccountType, UpdateUserDto } from './dto/update-user.dto';
import { RequestWithUser } from 'src/common/types/auth.types';
import { Express } from 'express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Auth } from 'src/common/decorators/auth.decorator';
import { ApiController } from 'src/common/decorators/custom-controller.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { FileUploadService } from 'src/file-upload/file-upload.service';

@Auth()
@ApiController('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly fileUploadService: FileUploadService,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get user profile information' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  getProfile(@Req() req: RequestWithUser) {
    return this.usersService.findBy({ id: req.user.id });
  }

  @UseInterceptors(
    FileInterceptor(
      'profileImage',
      FileUploadService.createMulterOptions(
        './uploads/users',
        'profileImage',
        1024 * 1024 * 1,
        /\/(jpg|jpeg|png|webp)$/i,
      ),
    ),
  )
  @ApiOperation({ summary: 'Update profile information' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        profileImage: {
          type: 'string',
          format: 'binary',
          nullable: true,
        },
        username: {
          type: 'string',
          nullable: true,
        },
        email: {
          type: 'string',
          format: 'email',
          nullable: true,
        },
        fullName: {
          type: 'string',
          nullable: true,
        },
        bio: {
          type: 'string',
          nullable: true,
        },
        location: {
          type: 'string',
          nullable: true,
        },
      },
    },
  })
  @Patch('/profile')
  async updateProfile(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: RequestWithUser,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    if (file) {
      const imageUrl = this.fileUploadService.generateFilePath(file, 'users');
      updateUserDto.profileImage = imageUrl;
    }
    return this.usersService.updateProfile(req.user.id, updateUserDto);
  }

  @Patch('password')
  @ApiOperation({ summary: 'Update user password' })
  @ApiResponse({
    status: 200,
    description: 'Password updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiBody({ type: UpdatePasswordDto })
  updatePassword(
    @Req() req: RequestWithUser,
    @Body() updatePasswordDto: UpdatePasswordDto,
  ) {
    return this.usersService.updatePassword(req.user.id, updatePasswordDto);
  }

  @Patch('account')
  @ApiOperation({ summary: 'Update user account type' })
  @ApiResponse({
    status: 200,
    description: 'Account type updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  updateAccountType(
    @Req() req: RequestWithUser,
    @Body() updateAccountType: UpdateAccountType,
  ) {
    return this.usersService.updateAccountType(req.user.id, updateAccountType);
  }

  @Delete('account')
  @ApiOperation({ summary: 'Delete user account' })
  @ApiResponse({
    status: 200,
    description: 'Account deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  deleteAccount(@Req() req: RequestWithUser) {
    return this.usersService.remove(req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'List of all users' })
  getAllUsers() {
    return this.usersService.getAllUsers();
  }
}
