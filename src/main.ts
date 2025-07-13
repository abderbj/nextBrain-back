import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Get environment variables
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
  const plantHealthBaseUrl = process.env.PLANT_HEALTH_BASE_URL;
  const isProduction = process.env.NODE_ENV === 'production';
  const hostIp = process.env.HOST_IP;
  
  // Configure CORS with proper credentials support
  const corsOrigins = [frontendUrl];
  if (plantHealthBaseUrl) {
    corsOrigins.push(plantHealthBaseUrl);
  }
  
  // Always allow localhost variations for development
  corsOrigins.push('http://localhost:3000', 'http://localhost:8080', 'http://127.0.0.1:3000', 'http://127.0.0.1:8080');
  
  // If HOST_IP is set (VM deployment), add those origins as well
  if (hostIp && hostIp !== 'localhost') {
    corsOrigins.push(`http://${hostIp}:3000`, `http://${hostIp}:8080`);
  }
  
  // Log CORS configuration for debugging
  console.log('CORS Origins allowed:', corsOrigins);
  console.log('HOST_IP:', hostIp);
  console.log('FRONTEND_URL:', frontendUrl);
  
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: ['Set-Cookie'],
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      enableDebugMessages: process.env.NODE_ENV !== 'production',
      disableErrorMessages: process.env.NODE_ENV === 'production',
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.use(cookieParser());
  app.use(helmet());

  const config = new DocumentBuilder()
    .setTitle('NextBrain')
    .setDescription('The API description for NextBrain - AI-powered chatbot application')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addCookieAuth(
      'access_token',
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token cookie (httpOnly, secure)',
      },
      'access-token',
    )
    .addCookieAuth(
      'refresh_token',
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Refresh token cookie (httpOnly, secure)',
      },
      'refresh-token',
    )
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, documentFactory);

  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
