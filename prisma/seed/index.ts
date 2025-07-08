import { PrismaClient } from '@prisma/client';
import { seedDatabase } from './seedData';

async function main() {
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    console.log('🔌 Connected to database');
    console.log('Starting database seeding...');

    // Run the comprehensive seed
    const result = await seedDatabase();
    
    console.log('\n🎉 Database seeding completed successfully!');
    console.log('Summary:', result);

  } catch (error) {
    console.error('❌ Error during database seeding:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
