const { Client, GatewayIntentBits, Collection, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
require('dotenv').config();
const fs = require('fs');

const POINTS_FILE = './points.json';

function loadPoints() {
    if (fs.existsSync(POINTS_FILE)) {
        const data = JSON.parse(fs.readFileSync(POINTS_FILE, 'utf8'));
        return new Map(Object.entries(data));
    }
    return new Map();
}

function savePoints(map) {
    const obj = Object.fromEntries(map);
    fs.writeFileSync(POINTS_FILE, JSON.stringify(obj, null, 2));
}

const invites = new Map();
const userPoints = loadPoints();
const inviteLogChannelId = '1512876323087978628';
const prizeLogChannelId = '1512876274291445840';

client.once('ready', async () => {
    console.log(`${client.user.tag} جاهز!`);
    const guild = client.guilds.cache.first();
    if (!guild) return console.log('لم يتم العثور على خادم.');

    const guildInvites = await guild.invites.fetch();
    guildInvites.forEach(invite => {
        invites.set(invite.code, invite.uses || 0);
    });

    console.log('تم حفظ الدعوات الحالية.');

    // تسجيل أوامر Slash
    const commands = [
        new SlashCommandBuilder()
            .setName('reset-points')
            .setDescription('إعادة تعيين نقاط عضو إلى 0')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('العضو المراد إعادة تعيين نقاطه')
                    .setRequired(true)
            )
            .toJSON(),
        new SlashCommandBuilder()
            .setName('add-points')
            .setDescription('إضافة نقاط لعضو')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('العضو المراد إضافة نقاط له')
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName('amount')
                    .setDescription('عدد النقاط المراد إضافتها')
                    .setRequired(true)
                    .setMinValue(1)
            )
            .toJSON()
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands });
    console.log('تم تسجيل أوامر Slash.');
});

// عند دخول عضو جديد
client.on('guildMemberAdd', async member => {
    const guild = member.guild;
    const newInvites = await guild.invites.fetch();
    const oldInvites = invites;

    const usedInvite = newInvites.find(invite => {
        const oldUses = oldInvites.get(invite.code) || 0;
        return invite.uses > oldUses;
    });

    const channel = guild.channels.cache.get(inviteLogChannelId);
    if (usedInvite) {
        const inviter = usedInvite.inviter;
        const currentPoints = userPoints.get(inviter.id) || 0;

        if (!member.user.bot && inviter) {
            if (userPoints.has(member.id)) {
                if (channel) {
                    channel.send(`مرحبًا <@${inviter.id}>! هذا العضو <@${member.id}> تمت دعوته من قبل، لن تحصل على نقاط إضافية ☹️`);
                }
            } else {
                userPoints.set(inviter.id, currentPoints + 1); // تحديث النقاط
                userPoints.set(member.id, 0); // لمنع تكرار الحساب
                savePoints(userPoints);
                if (channel) {
                    channel.send(`مرحبًا <@${inviter.id}>! لقد دعوت <@${member.id}> إلى السيرفر. نقاطك الآن: ${currentPoints + 1} 🔥`);
                }
            }
        }
    }

    newInvites.forEach(invite => {
        invites.set(invite.code, invite.uses || 0);
    });
});

// أوامر النقاط
client.on('messageCreate', async message => {
    if (message.content.startsWith('+add-points')) {
        if (!message.member.permissions.has('ManageGuild')) return message.reply('❌ ليس لديك صلاحية استخدام هذا الأمر.');

        const args = message.content.split(' ');
        const member = message.mentions.members.first();
        const pointsToAdd = parseInt(args[2], 10);

        if (!member || isNaN(pointsToAdd)) return message.reply('❌ صيغة الأمر غير صحيحة. استخدم: `+add-points @mentionUser عدد_النقاط`');

        const currentPoints = userPoints.get(member.id) || 0;
        userPoints.set(member.id, currentPoints + pointsToAdd);
        savePoints(userPoints);

        message.reply(`✅ تم إضافة ${pointsToAdd} نقطة لـ <@${member.id}>. النقاط الحالية: ${currentPoints + pointsToAdd}`);
    }

    if (message.content.startsWith('+points')) {
        const member = message.mentions.members.first() || message.member;
        const currentPoints = userPoints.get(member.id) || 0;

        message.reply(`📊 نقاط <@${member.id}>: ${currentPoints}`);
    }

    if (message.content === '+spin') {
        const userPointsCount = userPoints.get(message.author.id) || 0;

        if (userPointsCount < 1) return message.reply('❌ تحتاج على الأقل إلى 1 دعوة لاستخدام عجلة الحظ العادية!');

        const embed = new EmbedBuilder()
            .setTitle('🎉 لعبة عجلة الحظ 🎉')
            .setDescription('اختر نوع العجلة التي تريد اللعب بها:')
            .addFields(
                { name: '🎡 عجلة الحظ العادية', value: 'يتطلب 1 نقطة' },
                { name: '🔥 عجلة الحظ السوبر', value: 'يتطلب 2 نقاط' }
            )
            .setColor('Blue');

        const row = {
            type: 1,
            components: [
                {
                    type: 2,
                    label: 'لف العجلة العادية',
                    style: 1,
                    custom_id: 'normal_spin'
                },
                {
                    type: 2,
                    label: 'لف العجلة السوبر',
                    style: 4,
                    custom_id: 'super_spin'
                }
            ]
        };

        await message.reply({ embeds: [embed], components: [row] });
    }
});

// معالجة الأوامر والأزرار
client.on('interactionCreate', async interaction => {

    // أمر /reset-points
    if (interaction.isChatInputCommand() && interaction.commandName === 'reset-points') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ ليس لديك صلاحية استخدام هذا الأمر.', ephemeral: true });
        }

        const target = interaction.options.getUser('user');
        userPoints.set(target.id, 0);
        savePoints(userPoints);

        return interaction.reply({ content: `✅ تم إعادة تعيين نقاط <@${target.id}> إلى 0.`, ephemeral: true });
    }

    // أمر /add-points
    if (interaction.isChatInputCommand() && interaction.commandName === 'add-points') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ ليس لديك صلاحية استخدام هذا الأمر.', ephemeral: true });
        }

        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const currentPoints = userPoints.get(target.id) || 0;
        userPoints.set(target.id, currentPoints + amount);
        savePoints(userPoints);

        return interaction.reply({ content: `✅ تم إضافة ${amount} نقطة لـ <@${target.id}>. نقاطه الآن: ${currentPoints + amount}`, ephemeral: true });
    }

    if (!interaction.isButton()) return;

    const userPointsCount = userPoints.get(interaction.user.id) || 0;
    const prizeChannel = interaction.guild.channels.cache.get(prizeLogChannelId);

    if (interaction.customId === 'normal_spin') {
        if (userPointsCount < 1) return interaction.reply('❌ ليس لديك نقاط كافية.');

        userPoints.set(interaction.user.id, userPointsCount - 1); // خصم النقاط
        savePoints(userPoints);
        const prize = getRandomPrize('normal');

        if (prizeChannel) {
            prizeChannel.send(`> 🥳 مبروك <@${interaction.user.id}>! لقد فزت بـ **${prize}** 🏆`);
        }

        interaction.reply(`🎉 مبروك <@${interaction.user.id}>! لقد فزت بـ **${prize}**! 🏆`);
    } else if (interaction.customId === 'super_spin') {
        if (userPointsCount < 2) return interaction.reply('❌ ليس لديك نقاط كافية.');

        userPoints.set(interaction.user.id, userPointsCount - 2); // خصم النقاط
        savePoints(userPoints);
        const prize = getRandomPrize('super');

        if (prizeChannel) {
            prizeChannel.send(`> 🥳 مبروك <@${interaction.user.id}>! لقد فزت بـ **${prize}** 🏆`);
        }

        interaction.reply(`🎉 مبروك <@${interaction.user.id}>! لقد فزت بـ **${prize}**! 🏆`);
    }
});

// الجوائز ونسب الفوز
const prizes = {
    normal: [
        { prize: '200k', chance: 50 },       // 50%
        { prize: '300k', chance: 30 },       // 30%
        { prize: '600k', chance: 10 },       // 10%
        { prize: '1M', chance: 1 },          // 1%
        { prize: '2M', chance: 0.00001 },    // 0.00001%
    ],
    super: [
        { prize: '400k', chance: 50 },       // 50%
        { prize: '500k', chance: 30 },       // 30%
        { prize: '1M', chance: 10 },         // 10%
        { prize: '2M', chance: 5 },          // 5%
        { prize: '3M', chance: 5 },          // 5%
        { prize: '5M', chance: 1 },          // 1%
        { prize: '5M', chance: 0.00001 },   // 0.00001%
        { prize: '5M', chance: 0.00001 },   // 0.00001%
        { prize: '5m', chance: 0.00001 }  // 0.00001%
    ]
};

function getRandomPrize(type) {
    const list = prizes[type];
    const total = list.reduce((sum, item) => sum + item.chance, 0);
    const random = Math.random() * total;
    let cumulative = 0;

    for (const item of list) {
        cumulative += item.chance;
        if (random <= cumulative) {
            return item.prize;
        }
    }

    return list[list.length - 1].prize;
}

client.login(process.env.TOKEN);
