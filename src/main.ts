import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Dynamic CORS configuration based on HOST_IP
  const hostIP = process.env.HOST_IP;
  const corsOrigins: string[] = [];
  
  if (hostIP) {
    // VM deployment - use HOST_IP for both frontend and backend
    corsOrigins.push(`http://${hostIP}:8080`); // Frontend
    corsOrigins.push(`http://${hostIP}:3000`); // Backend (for self-requests)
    console.log(`CORS configured for VM deployment with IP: ${hostIP}`);
  } else {
    // Local development - use localhost
    corsOrigins.push('http://localhost:8080', 'http://localhost:3000');
    console.log('CORS configured for local development');
  }
  
  // Add any additional origins from environment variables
  if (process.env.FRONTEND_URL) {
    corsOrigins.push(process.env.FRONTEND_URL);
  }
  if (process.env.PLANT_HEALTH_BASE_URL) {
    corsOrigins.push(process.env.PLANT_HEALTH_BASE_URL);
  }
  
  console.log('Final CORS origins:', corsOrigins);
  
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
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
  
  // Configure Helmet with custom CSP to allow form submissions
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        formAction: ["'self'"], // Allow form submissions to same origin only
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
      },
    },
  }));

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
