import { PrismaClient } from '@prisma/client';
import { seedDailyTips } from './seeders/daily-tip.seeder';

async function main() {
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    console.log('Starting database seeding...');

    await seedDailyTips(prisma);

    console.log('Database seeding completed successfully!');
  } catch (error) {
    console.error('Error during database seeding:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
