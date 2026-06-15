require('dotenv').config();
const { Bot, Keyboard, InlineKeyboard } = require('grammy');
const express = require('express');
const cors = require('cors');
const path = require('path'); // Tepaga ko'chirildi

// Portni Render muhitiga moslash (yoki lokal uchun 5000)
const PORT = process.env.PORT || 5000;

const bot = new Bot(process.env.BOT_TOKEN);

console.log("------------------------------------------------");
console.log("🚀 SmartStore Multi-Lingual Bot (Fully Dynamic Settings)...");
console.log("------------------------------------------------");

// 🌐 Vaqtinchalik xotira va sozlamalar ombori
const activeSessions = new Map(); 
const userLanguages = new Map(); 
let globalSalesData = [];        

// ⚙️ React Settings paneldan keladigan dynamic sozlamalar
let botSettings = {
  sellerTelegramId: '',
  cardFields: '',
  storePhone: '+998 (90) 123-45-67',
  storeName: "Qurilish mollari do'koni"
};

// ==========================================
// 🌐 TARJIMALAR LUG'ATI (UZ / RU)
// ==========================================
const translations = {
  uz: {
    welcome: "👋 Do'konimiz botiga xush kelibsiz!",
    id_info: "📌 Sizning ID raqamingiz:",
    id_hint: "_(Ushbu IDni sotuvchiga aytsangiz, hisobingiz tizimga ulanadi)_",
    select_menu: "👇 Quyidagi menyudan foydalaning:",
    menu_debts: "📝 Mening qarzlarim",
    menu_history: "📜 To'lovlar tarixi",
    menu_schedule: "🗓 To'lov grafiklari",
    menu_cards: "💳 Karta raqamlari",
    menu_help: "📞 Yordam / Aloqa",
    menu_refresh: "🔄 Yangilash",
    no_debts: "🎉 Sizning hech qanday qarzdorligingiz topilmadi!",
    total_debt: "\n💵 UMUMIY QARZDORLIK:",
    debt_hint: "\n\n💡 To'lov chekini rasm holatida ushbu botga yuboring.",
    no_history: "ℹ️ Sizda hali to'lovlar tarixi mavjud emas.",
    history_title: "📜 SIZNING OXIRGI TO'LOVLARINGIZ:\n\n",
    history_success: "✅ To'lov tasdiqlangan",
    no_schedule: "🎉 Yaqin orada majburiy to'lov muddatlari yo'q.",
    schedule_title: "🗓 YAQINLASHAYOTGAN TO'LOV MUDDATLARI:\n\n",
    days_left: "kun qoldi",
    today: "Bugun to'lash kerak!",
    overdue: "kun o'tib ketdi!",
    check_received: "🔄 Chek qabul qilindi! Do'kon boshqaruvchisi tekshirmoqda...",
    session_error: "❌ Xatolik: Tizim sozlamalari kiritilmagan yoki sotuvchi topilmadi."
  },
  ru: {
    welcome: "👋 Добро пожаловать в бот нашего магазина!",
    id_info: "📌 Ваш ID номер:",
    id_hint: "_(Сообщите этот ID продавцу, чтобы связать ваш аккаунт)_",
    select_menu: "👇 Используйте меню ниже:",
    menu_debts: "📝 Мои долги",
    menu_history: "📜 История платежей",
    menu_schedule: "🗓 График платежей",
    menu_cards: "💳 Номера карт",
    menu_help: "📞 Помощь / Связь",
    menu_refresh: "🔄 Обновить",
    no_debts: "🎉 У вас не найдено задолженностей!",
    total_debt: "\n💵 ОБЩАЯ ЗАДОЛЖЕННОСТЬ:",
    debt_hint: "\n\n💡 Отправьте скриншот чека в виде фото в этот бот.",
    no_history: "ℹ️ У вас пока нет истории платежей.",
    history_title: "📜 ВАШИ ПОСЛЕДНИЕ ПЛАТЕЖИ:\n\n",
    history_success: "✅ Платеж подтвержден",
    no_schedule: "🎉 В ближайшее время обязательных платежей нет.",
    schedule_title: "🗓 БЛИЖАЙШИЕ СРОКИ ОПЛАТЫ:\n\n",
    days_left: "дн. осталось",
    today: "Оплатить сегодня!",
    overdue: "дн. просрочено!",
    check_received: "🔄 Чек принят! Администратор проверяет его...",
    session_error: "❌ Ошибка: Настройки системы не установлены."
  }
};

function getMainMenu(lang) {
  const ln = translations[lang] || translations.uz;
  return new Keyboard()
    .text(ln.menu_debts).text(ln.menu_history)
    .row()
    .text(ln.menu_schedule).text(ln.menu_refresh)
    .row()
    .text(ln.menu_cards).text(ln.menu_help)
    .resized();
}

// ==========================================
// 🏁 /START - TIL TANLASH OYNASI
// ==========================================
bot.command('start', async (ctx) => {
  const chooseLangKeyboard = new InlineKeyboard()
    .text("🇺🇿 O'zbekcha", "set_lang_uz")
    .text("🇷🇺 Русский", "set_lang_ru");

  await ctx.reply("🌐 Iltimos, tilni tanlang / Пожалуйста, выберите язык:", {
    reply_markup: chooseLangKeyboard
  });
});

bot.callbackQuery(/set_lang_(uz|ru)/, async (ctx) => {
  const lang = ctx.match[1];
  userLanguages.set(ctx.chat.id, lang);
  
  const ln = translations[lang];
  await ctx.deleteMessage();
  await ctx.reply(
    `${ln.welcome}\n\n${ln.id_info} \`${ctx.chat.id}\`\n${ln.id_hint}\n\n${ln.select_menu}`,
    { parse_mode: 'Markdown', reply_markup: getMainMenu(lang) }
  );
  await ctx.answerCallbackQuery();
});

function getLang(ctx) {
  return userLanguages.get(ctx.chat.id) || 'uz';
}

// ========================================================
// 📊 1. QARZLAR RO'YXATI
// ========================================================
async function sendDebtReport(ctx) {
  const lang = getLang(ctx);
  const ln = translations[lang];
  const chatId = String(ctx.chat.id);
  
  const customerDebts = globalSalesData.filter(sale => sale.isDebt === true && String(sale.telegramChatId) === chatId);

  if (customerDebts.length === 0) {
    return ctx.reply(ln.no_debts, { parse_mode: 'Markdown' });
  }

  let reportMessage = `📋 *${ln.menu_debts.toUpperCase()}:*\n\n`;
  let totalSom = 0, totalUsd = 0;

  customerDebts.forEach((debt, index) => {
    const isKv = debt.unit && (debt.unit.toLowerCase() === 'kv' || debt.unit.includes('$'));
    const remaining = debt.totalSum - (debt.paidAmount || 0);
    const currencyStr = isKv ? '$' : (lang === 'uz' ? "so'm" : "сум");

    if (isKv) totalUsd += remaining; else totalSom += remaining;
    const dateStr = new Date(debt.id).toLocaleDateString();
    
    reportMessage += `${index + 1}. 🏪 *${lang === 'uz' ? 'Tovar':'Товар'}:* ${debt.productName || "Xarid"}\n` +
                     `   📅 *${lang === 'uz' ? 'Sana':'Дата'}:* ${dateStr}\n` +
                     `   💰 *${lang === 'uz' ? 'Qoldiq':'Остаток'}:* ${remaining.toLocaleString()} ${currencyStr}\n`;
    
    if (debt.debtDeadline) {
      const daysLeft = Math.ceil((debt.debtDeadline - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft > 0) reportMessage += `   ⏳ *${lang === 'uz' ? 'Muddat':'Срок'}:* ${daysLeft} ${ln.days_left}\n`;
      else if (daysLeft === 0) reportMessage += `   🚨 *${lang === 'uz' ? 'Muddat':'Срок'}:* ${ln.today}\n`;
      else reportMessage += `   ⚠️ *${lang === 'uz' ? 'Muddat':'Срок'}:* ${Math.abs(daysLeft)} ${ln.overdue}\n`;
    }
    reportMessage += `----------------------------------\n`;
  });

  reportMessage += `${ln.total_debt}`;
  if (totalSom > 0) reportMessage += `\n🔴 ${totalSom.toLocaleString()} ${lang === 'uz' ? "so'm":"сум"}`;
  if (totalUsd > 0) reportMessage += `\n🔴 ${totalUsd.toLocaleString()} $`;
  reportMessage += ln.debt_hint;

  const inlineAction = new InlineKeyboard().text("🧾 Yo'riqnoma", "show_help_payment");
  await ctx.reply(reportMessage, { parse_mode: 'Markdown', reply_markup: inlineAction });
}

bot.hears(["📝 Mening qarzlarim", "📝 Мои долги"], sendDebtReport);
bot.hears(["🔄 Yangilash", "🔄 Обновить"], async (ctx) => {
  await sendDebtReport(ctx);
});

// ========================================================
// 📜 2. TO'LOVLAR TARIXI
// ========================================================
bot.hears(["📜 To'lovlar tarixi", "📜 История платежей"], async (ctx) => {
  const lang = getLang(ctx);
  const ln = translations[lang];
  const chatId = String(ctx.chat.id);
  
  const paymentHistory = globalSalesData.filter(sale => String(sale.telegramChatId) === chatId && sale.paidAmount > 0);

  if (paymentHistory.length === 0) return ctx.reply(ln.no_history, { parse_mode: 'Markdown' });

  let historyMessage = ln.history_title;
  paymentHistory.slice(-10).forEach((pay, index) => { 
    const isKv = pay.unit && (pay.unit.toLowerCase() === 'kv' || pay.unit.includes('$'));
    const currencyStr = isKv ? '$' : (lang === 'uz' ? "so'm" : "сум");
    historyMessage += `✅ *${index + 1}. ${ln.history_success}*\n` +
                      `   📅 *Sana:* ${new Date(pay.id).toLocaleDateString()}\n` +
                      `   💰 *Summa:* ${pay.paidAmount.toLocaleString()} ${currencyStr}\n` +
                      `   🏪 *Tovar:* ${pay.productName || "Xarid"}\n----------------------------------\n`;
  });
  await ctx.reply(historyMessage, { parse_mode: 'Markdown' });
});

// ========================================================
// 🗓 3. TO'LOV GRAFIKLARI
// ========================================================
bot.hears(["🗓 To'lov grafiklari", "🗓 График платежей"], async (ctx) => {
  const lang = getLang(ctx);
  const ln = translations[lang];
  const chatId = String(ctx.chat.id);
  
  const activeDebts = globalSalesData.filter(sale => sale.isDebt === true && String(sale.telegramChatId) === chatId && sale.debtDeadline);
  if (activeDebts.length === 0) return ctx.reply(ln.no_schedule, { parse_mode: 'Markdown' });

  activeDebts.sort((a, b) => a.debtDeadline - b.debtDeadline);
  let scheduleMessage = ln.schedule_title;

  activeDebts.forEach((debt, index) => {
    const isKv = debt.unit && (debt.unit.toLowerCase() === 'kv' || debt.unit.includes('$'));
    const remaining = debt.totalSum - (debt.paidAmount || 0);
    const daysLeft = Math.ceil((debt.debtDeadline - Date.now()) / (1000 * 60 * 60 * 24));
    let statusLabel = `⏳ ${daysLeft} ${ln.days_left}`;
    if (daysLeft === 0) statusLabel = ln.today;
    if (daysLeft < 0) statusLabel = `${Math.abs(daysLeft)} ${ln.overdue}`;

    scheduleMessage += `📌 *🧾 #${index + 1}*\n   📅 *Sana:* ${new Date(debt.debtDeadline).toLocaleDateString()}\n   💰 *Summa:* ${remaining.toLocaleString()} ${isKv ? '$': (lang==='uz'?"so'm":"сум")}\n   📊 *Status:* _${statusLabel}_\n----------------------------------\n`;
  });
  await ctx.reply(scheduleMessage, { parse_mode: 'Markdown' });
});

// ========================================================
// 💳 4. DINAMIK KARTA VA BOG'LANISH (SOTUVCHI PANELIDAN)
// ========================================================
bot.hears(["CN", "💳 Karta raqamlari", "💳 Номера карт"], async (ctx) => {
  const cardMessage = botSettings.cardFields 
    ? `💳 *To'lov qabul qiluvchi karta ma'lumotlari:*\n\n\`${botSettings.cardFields}\`\n\n_Ustiga bossangiz nusxalanadi._`
    : `💳 *Karta raqami kiritilmagan.*`;

  await ctx.reply(cardMessage, { parse_mode: 'Markdown' });
});

bot.hears(["📞 Yordam / Aloqa", "📞 Помощь / Связь"], async (ctx) => {
  const helpMessage = `🏪 *${botSettings.storeName}*\n\n📞 *Aloqa uchun telefon:* ${botSettings.storePhone}\n\n💡 Muammo yoki savollar bo'lsa do'kon ma'muriyatiga telefon qilishingiz mumkin.`;
  await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});

bot.callbackQuery("show_help_payment", async (ctx) => {
  const lang = getLang(ctx);
  const helpMsg = botSettings.cardFields
    ? (lang === 'uz' ? `Ushbu kartaga pul o'tkazing va chek rasmini botga yuboring:\n\n\`${botSettings.cardFields}\`` : `Переведите деньги на эту карту и отправьте фото чека в бот:\n\n\`${botSettings.cardFields}\``)
    : (lang === 'uz' ? "Karta raqami kiritilmagan." : "Номер карты не указан.");
  
  await ctx.reply(helpMsg, { parse_mode: 'Markdown' });
  await ctx.answerCallbackQuery();
});

// ========================================================
// 📩 5. CHEK QABUL QILISH VA SOTUVCHIGA JONLI YUBORISH
// ========================================================
let archivedChecks = []; 

bot.on('message:photo', async (ctx) => {
  const lang = getLang(ctx);
  const chatId = ctx.chat.id;
  const session = activeSessions.get(String(chatId));

  const targetSellerId = botSettings.sellerTelegramId || session?.sellerTelegramId;

  if (!targetSellerId) {
    return ctx.reply(translations[lang].session_error);
  }

  const photo = ctx.message.photo.pop();
  const fileId = photo.file_id;

  await ctx.reply(translations[lang].check_received, { parse_mode: 'Markdown' });
  const checkAmount = session ? session.amount : (lang === 'uz' ? "Umumiy/Ixtiyoriy to'lov" : "Произвольный платеж");

  try {
    await ctx.api.sendPhoto(targetSellerId, fileId, {
      caption: `🧾 *YANGI TO'LOV CHEKI KELDI!*\n\nMijoz: ${ctx.from.first_name}\nID: \`${chatId}\`\nSumma: ${checkAmount}\n\nTasdiqlaysizmi?`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Tasdiqlash", callback_data: `accept_${chatId}_${fileId}` },
          { text: "❌ Rad etish", callback_data: `reject_${chatId}_${fileId}` }
        ]]
      }
    });
    console.log(`✅ Chek sotuvchiga (${targetSellerId}) jo'natildi.`);
  } catch (err) { 
    console.log("❌ Sotuvchiga chek yuborishda xatolik:", err.message); 
  }
});

bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  
  if (data.startsWith('accept_') || data.startsWith('reject_')) {
    const parts = data.split('_');
    const status = parts[0] === 'accept' ? 'Tasdiqlandi' : 'Rad etildi';
    const userChatId = parts[1];
    const fileId = parts[2];

    archivedChecks.push({
      id: Date.now(),
      chatId: userChatId,
      customerName: ctx.from.first_name,
      fileId: fileId,
      status: status,
      time: new Date().toISOString()
    });

    try {
      const msg = status === 'Tasdiqlandi' ? "✅ To'lovingiz tasdiqlandi!" : "❌ To'lovingiz rad etildi!";
      await ctx.api.sendMessage(userChatId, msg);
    } catch(e) {}

    await ctx.editMessageCaption({ caption: ctx.callbackQuery.message.caption + `\n\n🟢 *XOLAT:* ${status}` });
  }
  await ctx.answerCallbackQuery();
});

bot.on('message:text', async (ctx) => {
  await ctx.reply("👇 Menyudan foydalaning:", { reply_markup: getMainMenu(getLang(ctx)) });
});

// ==========================================
// 🌐 EXPRESS API & STATIC FILES (Arxitektura to'g'rilandi 🛠)
// ==========================================
const app = express();
app.use(cors()); 
app.use(express.json());

// 🌟 React Build (dist) papkasini ulash — "app.listen"dan tepaga ko'chirildi!
app.use(express.static(path.join(__dirname, 'dist')));

app.get('/api/archived-checks', (req, res) => {
  return res.status(200).json({ success: true, checks: archivedChecks });
});

app.post('/api/sync-sales', (req, res) => {
  if (req.body.settings) {
    botSettings = {
      sellerTelegramId: req.body.settings.sellerTelegramId || botSettings.sellerTelegramId,
      cardFields: req.body.settings.cardFields || botSettings.cardFields,
      storePhone: req.body.settings.storePhone || botSettings.storePhone,
      storeName: req.body.settings.storeName || botSettings.storeName
    };
    console.log("⚙️ Bot dynamic sozlamalari yangilandi:", botSettings);
  }

  if (Array.isArray(req.body.sales)) { 
    globalSalesData = req.body.sales; 
    return res.status(200).json({ success: true }); 
  }
  return res.status(400).json({ success: false });
});

app.post('/api/send-remind', async (req, res) => {
  const { chatId, customerName, amount, cardFields, sellerTelegramId } = req.body;
  activeSessions.set(String(chatId), { sellerTelegramId, amount, sellerCard: cardFields });
  try {
    await bot.api.sendMessage(chatId, `⚠️ *ESLATMA:* ${customerName}, qarz: ${amount}\nKarta: \`${cardFields}\``);
    return res.status(200).json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// 🌟 Barcha qolgan so'rovlar uchun React interfeysini ochish (Router muammosi yechildi)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ==========================================
// 🚀 SERVER VA BOTNI ISHGA TUSHIRISH
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 Server ${PORT}-portda muvaffaqiyatli yoqildi!`);
  
  // Botni parallel ravishda xavfsiz ishga tushirish
  bot.start().catch((err) => {
    console.error("❌ Botni start qilishda xatolik:", err.message);
  });
});