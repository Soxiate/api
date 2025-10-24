import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Hash passwords
  const hashedPassword = await bcrypt.hash('password123', 10);

  // Create demo users
  await prisma.user.upsert({
    where: { email: 'tiyasijohannes@gmail.com' },
    update: {},
    create: {
      name: 'Johannes Tiyasi',
      email: 'tiyasijohannes@gmail.com',
      password: hashedPassword,
      authId: 'user-1',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Johannes',
    },
  });

  await prisma.user.upsert({
    where: { email: 'khozanhlanhla00@gmail.com' },
    update: {},
    create: {
      name: 'Nhlanhla Khoza',
      email: 'khozanhlanhla00@gmail.com',
      password: hashedPassword,
      authId: 'user-2',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nhlanhla',
    },
  });

  console.log('✅ Created users:');
  console.log('  - Johannes Tiyasi (tiyasijohannes@gmail.com)');
  console.log('  - Nhlanhla Khoza (khozanhlanhla00@gmail.com)');
  console.log('  - Password: password123');
  console.log('🎉 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
