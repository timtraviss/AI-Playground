import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const questions = await prisma.$queryRaw<Array<{ id: number; tag: string }>>`
    SELECT id, tag FROM ddp."Question"
  `
  console.log(`Migrating ${questions.length} questions…`)

  for (const q of questions) {
    const tags = q.tag ? JSON.stringify([q.tag]) : '[]'
    await prisma.$executeRaw`
      UPDATE ddp."Question" SET tags = ${tags} WHERE id = ${q.id}
    `
  }

  console.log('Done.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
