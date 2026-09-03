import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  addCivilDays,
  civilDateInTimeZone,
  parseCivilDate,
  zonedDateTimeToUtc,
} from "../src/lib/dates/civil-date";
import { generateRandomResult } from "../src/server/domain/randomizer";

const prisma = new PrismaClient();

const demoUsers = [
  ["ana@galera.local", "Ana"],
  ["bruno@galera.local", "Bruno"],
  ["carla@galera.local", "Carla"],
  ["daniel@galera.local", "Daniel"],
  ["eduarda@galera.local", "Eduarda"],
  ["felipe@galera.local", "Felipe"],
  ["gabriela@galera.local", "Gabriela"],
  ["henrique@galera.local", "Henrique"],
] as const;

async function main() {
  const timezone = "America/Sao_Paulo";
  const today = civilDateInTimeZone(new Date(), timezone);
  const date = (daysFromToday: number) => addCivilDays(today, daysFromToday);
  const dateTime = (daysFromToday: number, time: string) =>
    zonedDateTimeToUtc(date(daysFromToday), time, timezone);
  const passwordHash = await bcrypt.hash("demo1234", 12);
  const users = [];

  for (const [email, name] of demoUsers) {
    users.push(
      await prisma.user.upsert({
        where: { email },
        update: { name, passwordHash },
        create: { email, name, passwordHash },
      }),
    );
  }

  const owner = users[0];
  const community = await prisma.community.upsert({
    where: { slug: "galera" },
    update: { name: "Galera", createdById: owner.id },
    create: {
      name: "Galera",
      slug: "galera",
      description: "A comunidade de demonstração.",
      createdById: owner.id,
    },
  });

  for (const [index, user] of users.entries()) {
    await prisma.communityMember.upsert({
      where: { communityId_userId: { communityId: community.id, userId: user.id } },
      update: {
        displayName: index === 0 ? "Aninha" : null,
        role: index === 0 ? "OWNER" : index === 1 ? "ADMIN" : "MEMBER",
      },
      create: {
        communityId: community.id,
        userId: user.id,
        displayName: index === 0 ? "Aninha" : null,
        role: index === 0 ? "OWNER" : index === 1 ? "ADMIN" : "MEMBER",
      },
    });
  }

  await prisma.scheduleRule.deleteMany({ where: { communityId: community.id } });
  await prisma.availabilityOverride.deleteMany({ where: { communityId: community.id } });
  await prisma.eventRsvp.deleteMany({ where: { event: { communityId: community.id } } });
  await prisma.event.deleteMany({ where: { communityId: community.id } });
  await prisma.pollVote.deleteMany({ where: { poll: { communityId: community.id } } });
  await prisma.pollOption.deleteMany({ where: { poll: { communityId: community.id } } });
  await prisma.poll.deleteMany({ where: { communityId: community.id } });
  await prisma.randomizerRun.deleteMany({ where: { communityId: community.id } });

  const startDate = parseCivilDate(date(-30));
  const mondayToFriday = {
    monday: "WORKING",
    tuesday: "WORKING",
    wednesday: "WORKING",
    thursday: "WORKING",
    friday: "WORKING",
    saturday: "DAY_OFF",
    sunday: "DAY_OFF",
  } satisfies Prisma.InputJsonValue;

  await prisma.scheduleRule.create({
    data: {
      communityId: community.id,
      userId: users[0].id,
      name: "Comercial",
      ruleType: "WEEKLY",
      weeklyPattern: mondayToFriday,
      startDate,
    },
  });
  await prisma.scheduleRule.create({
    data: {
      communityId: community.id,
      userId: users[1].id,
      name: "Plantão 12x36",
      ruleType: "CYCLE",
      anchorDate: startDate,
      workDays: 1,
      restDays: 1,
      startDate,
    },
  });
  await prisma.scheduleRule.create({
    data: {
      communityId: community.id,
      userId: users[2].id,
      name: "Escala 4x2",
      ruleType: "CYCLE",
      anchorDate: startDate,
      workDays: 4,
      restDays: 2,
      startDate,
    },
  });
  await prisma.availabilityOverride.create({
    data: {
      communityId: community.id,
      userId: users[3].id,
      startAt: zonedDateTimeToUtc(date(3), "00:00", timezone),
      endAt: zonedDateTimeToUtc(date(7), "00:00", timezone),
      allDay: true,
      status: "VACATION",
      note: "Férias",
    },
  });
  await prisma.availabilityOverride.create({
    data: {
      communityId: community.id,
      userId: users[4].id,
      startAt: zonedDateTimeToUtc(date(10), "00:00", timezone),
      endAt: zonedDateTimeToUtc(date(11), "00:00", timezone),
      allDay: true,
      status: "DAY_OFF",
      note: "Folga adicionada manualmente",
    },
  });

  const events = await Promise.all([
    prisma.event.create({
      data: {
        communityId: community.id,
        createdById: owner.id,
        title: "Corrida no parque",
        description: "Encontro leve para começar o fim de semana.",
        startsAt: dateTime(3, "08:00"),
        timezone,
        locationName: "Parque Central",
      },
    }),
    prisma.event.create({
      data: {
        communityId: community.id,
        createdById: users[1].id,
        title: "Game Night",
        startsAt: dateTime(9, "20:00"),
        timezone,
        locationName: "Casa do Bruno",
      },
    }),
    prisma.event.create({
      data: {
        communityId: community.id,
        createdById: owner.id,
        title: "Trilha de domingo",
        startsAt: dateTime(18, "08:00"),
        timezone,
        locationName: "Serra Azul",
      },
    }),
    prisma.event.create({
      data: {
        communityId: community.id,
        createdById: owner.id,
        title: "Encontro passado",
        startsAt: dateTime(-20, "09:00"),
        timezone,
        status: "COMPLETED",
      },
    }),
  ]);

  for (const [eventIndex, event] of events.entries()) {
    for (const [userIndex, user] of users.entries()) {
      if ((userIndex + eventIndex) % 3 !== 0)
        await prisma.eventRsvp.create({
          data: {
            eventId: event.id,
            userId: user.id,
            status: userIndex % 2 === 0 ? "GOING" : "MAYBE",
          },
        });
    }
  }

  const pollData = [
    {
      title: "Qual destino da próxima viagem?",
      description: "Escolha o destino que mais anima você.",
      type: "SINGLE_CHOICE" as const,
      options: ["Brotas", "Paraty", "Serra Negra"],
    },
    {
      title: "Quais atividades você toparia?",
      description: "Marque todas as atividades que você faria.",
      type: "MULTIPLE_CHOICE" as const,
      options: ["Trilha", "Churrasco", "Boardgame"],
    },
    {
      title: "Qual data funciona melhor?",
      description: "Vote nas datas possíveis e compare a disponibilidade da galera.",
      type: "DATE_OPTIONS" as const,
      options: [date(17), date(18), date(24)],
    },
    {
      title: "Votação encerrada de exemplo",
      description: "Resultado histórico preservado.",
      type: "SINGLE_CHOICE" as const,
      options: ["Opção A", "Opção B"],
      status: "CLOSED" as const,
    },
  ];

  for (const item of pollData) {
    const poll = await prisma.poll.create({
      data: {
        communityId: community.id,
        createdById: owner.id,
        title: item.title,
        description: item.description,
        type: item.type,
        status: item.status ?? "OPEN",
        options: {
          create: item.options.map((label, index) => ({
            label,
            sortOrder: index,
            dateValue: item.type === "DATE_OPTIONS" ? parseCivilDate(label) : undefined,
          })),
        },
      },
      include: { options: true },
    });
    for (const [userIndex, user] of users.entries()) {
      const option = poll.options[userIndex % poll.options.length];
      if (userIndex < 5 && (item.status !== "CLOSED" || userIndex < 3))
        await prisma.pollVote.create({
          data: { pollId: poll.id, optionId: option.id, userId: user.id },
        });
      if (item.type === "MULTIPLE_CHOICE" && userIndex < 2) {
        const secondOption = poll.options[(userIndex + 1) % poll.options.length];
        await prisma.pollVote.create({
          data: { pollId: poll.id, optionId: secondOption.id, userId: user.id },
        });
      }
    }
  }

  const randomizerParticipants = users.map((user) => ({ id: user.id, label: user.name }));
  const randomizerConfiguration = {
    groupCount: 2,
    maxGroupSize: 4,
    groupNames: ["Time Roxo", "Time Laranja"],
  };
  const randomizerResult = generateRandomResult({
    presetType: "TEAMS",
    participants: randomizerParticipants,
    configuration: randomizerConfiguration,
    constraints: { captainIds: [users[0].id, users[1].id] },
  });
  await prisma.randomizerRun.create({
    data: {
      communityId: community.id,
      createdById: owner.id,
      presetType: "TEAMS",
      title: "Times da próxima brincadeira",
      configuration: randomizerConfiguration,
      inputSnapshot: randomizerParticipants,
      result: randomizerResult as Prisma.InputJsonValue,
    },
  });

  console.log(`Seed concluído: ${community.name} com ${users.length} usuários.`);
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
