import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

interface DailyTipData {
  title: string;
  content: string;
  category: string;
}

export async function seedDailyTips(prisma?: PrismaClient) {
  const prismaClient = prisma || new PrismaClient();
  const shouldDisconnect = !prisma;

  try {
    console.log('Seeding daily tips...');
    const filePath = path.join(__dirname, '../data/daily-tips.json');

    if (!fs.existsSync(filePath)) {
      console.warn(
        `Daily tips data file not found at ${filePath}. Skipping daily tips seeding.`,
      );
      return;
    }

    const rawData = fs.readFileSync(filePath, 'utf-8');
    const tips: DailyTipData[] = JSON.parse(rawData) as DailyTipData[];

    await prismaClient.dailyTip.deleteMany({});

    await prismaClient.dailyTip.createMany({
      data: tips.map((tip) => ({
        title: tip.title,
        content: tip.content,
        category: tip.category,
      })),
    });

    const count = await prismaClient.dailyTip.count();
    console.log(`Daily tips seeding completed! Added ${count} tips.`);
  } catch (error) {
    console.error('Error seeding daily tips:', error);
    throw error;
  } finally {
    if (shouldDisconnect) {
      await prismaClient.$disconnect();
    }
  }
}

if (require.main === module) {
  seedDailyTips()
    .then(() => {
      console.log('Daily tips seeding script completed successfully.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error running daily tips seeder:', error);
      process.exit(1);
    });
}
