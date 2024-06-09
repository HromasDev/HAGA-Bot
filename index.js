const telegram = require('node-telegram-bot-api')
const deferred = require('deferred')
const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const fs = require('fs');
const path = require('path');
const { download, navButtons, options } = require('./buttons');
require('dotenv').config();

const bot = new telegram(process.env.TOKEN, { polling: true })

const gamesPageUrl = process.env.GAMES_PAGE_URL;

const downloadFile = async (url, saveDirectory) => {
  const response = await axios.get(url, { responseType: 'stream' });

  const contentDisposition = response.headers['content-disposition'];
  const match = contentDisposition.match(/attachment; filename="([^"]+)"/);

  const fileName = match[1];
  const savePath = path.join(saveDirectory, fileName);

  const writer = fs.createWriteStream(savePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(fileName));
    writer.on('error', reject);
  });
}

async function GetGames() {
  const response = await axios.get(gamesPageUrl, { responseType: 'arraybuffer' });
  const html = iconv.decode(Buffer.from(response.data), 'windows-1251');
  const $ = cheerio.load(html);

  let list = [];
  $('#dle-content div a').each((i, elem) => { // получаем список игр
    let info = {};
    info['title'] = $(elem).attr('title');
    info['url'] = $(elem).attr('href');
    list.push(info);
  });

  return list;
}

async function GetGameData(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const html = iconv.decode(Buffer.from(response.data), 'windows-1251');
  const $ = cheerio.load(html);

  let game_data = [];
  let files = [];
  let manual = "";
  $('.quote').each((i, elem) => {
    game_data.push($(elem).text())
  });

  $('.quote p').each((i, elem) => {
    game_data.push($(elem).text())
  });

  $('a[target="_blank"]').each((_idx, el) => {
    let title = $(el).text();
    if ($(el).attr('href').includes('getfile-')) {
      let file_id = $(el).attr('href').split('getfile-')[1];
      files.push({ title, file_id });
    }
  });


  game_data[0] = game_data[0].split('\n');
  game_data[0] = game_data[0].filter((n) => {
    const lowerCaseString = n.toLowerCase();
    return !(lowerCaseString.includes('обзор игры') || lowerCaseString.includes('системные требования')) && !(lowerCaseString == '');
  });

  return { description: game_data[0], files };
}

let defferred = [];

bot.on('message', async (msg) => {
  const foundUser = defferred.find(data => data.user_id === msg.chat.id);

  if (foundUser) {
    if (foundUser.games) {
      const gameIndex = +msg.text;
      const gameToFind = foundUser.games.find(game => game.index === gameIndex);

      if (gameToFind) {
        const answer = await GetGameData(gameToFind.url);
        const description = answer.description.join('\n');

        if (answer.files.length < 1) {
          await bot.sendMessage(msg.from.id, 'У этой игры нету файлов, попробуйте выбрать другую игру');
          return
        } else if (answer.description.length < 1) {
          await bot.sendMessage(msg.from.id, 'Без описания:');
        }

        await bot.sendMessage(msg.from.id, description);

        await Promise.all(answer.files.map(async file => {
          const saveDirectory = path.join('files', '' + msg.chat.id);

          if (!fs.existsSync(saveDirectory)) {
            fs.mkdirSync(saveDirectory, { recursive: true });
          }

          const fileUrl = `${process.env.GAMES_DIRECT_LINK}${file.file_id}`;

          const fileName = await downloadFile(fileUrl, saveDirectory); // Ждем, пока файл будет загружен и сохранен
          const filePath = path.join(saveDirectory, fileName);

          if (fs.existsSync(filePath)) {
            await bot.sendDocument(msg.chat.id, fs.createReadStream(filePath));
            fs.unlinkSync(filePath);
          } else {
            console.error('Файл не найден:', filePath);
          }
        }));
      } else {
        await bot.sendMessage(msg.from.id, 'Выберите игру от ' + 1 + ' до ' + foundUser.games.length, navButtons('games'));
        return
      }
    }
    foundUser.def.resolve(msg);
    defferred.splice(defferred.indexOf(foundUser), 1);
    return;
  }

  if (msg.text === '/start') {
    await bot.sendMessage(msg.chat.id, "Привет. Я бот, созданный для загрузки игр/приложений.", options);
  }

  else if (msg.text === 'Скачать') {
    await bot.sendMessage(msg.chat.id, 'Что будем скачивать?', download);
  }

  else if (msg.data == 'games') {
    const question = await msg.question('Какую игру вы хотите?')
    const answer = await searchGame(question, msg.from.id);
    await bot.sendMessage(msg.from.id, answer, navButtons('games'))
  }

  else if (msg.data == 'progs') {
    await bot.sendMessage(msg.from.id, 'В разработке...', navButtons('progs'))
  }

  else if (msg.text === 'Discord') {
    await bot.sendMessage(msg.chat.id, "📨 https://discord.gg/M7MqQhhu5j 📨");
  }

  else if (msg.text === 'Облако') {
    await bot.sendMessage(msg.chat.id, "Ваше хранилище:");
  }

  else {
    await bot.sendMessage(msg.chat.id, "Что это?");
  }
});

async function searchGame(prompt, user_id) {
  // Получаем список игр
  const GamesList = await GetGames();
  let text = 'Результаты поиска:\n\n';
  let index = 1;

  let findGames = [];
  // Фильтруем список по промпту
  GamesList.forEach(game => {
    if (game.title.toLowerCase().includes(prompt.toLowerCase())) {
      game.index = index++;
      text += `${game.index}. ${game.title}\n`;
      findGames.push(game);
    }
  });

  if (text.length > 4000) text = 'Получено слишком много результатов, попробуйте уточнить запрос или изменить категорию.';
  else {
    const foundUser = defferred.find(data => data.user_id === user_id);
    if (foundUser) {
      foundUser.games.push(...findGames);
    } else {
      const def = new deferred();
      defferred.push({ user_id: user_id, games: findGames, def: def });
    }
  }
  return text;
}

bot.on('callback_query', async (msg) => {
  // Чистим запросы текущего пользователя
  defferred = defferred.filter(data => {
    if (data.user_id === msg.from.id) {
      data.def.resolve(msg);
      return false;
    }
    return true;
  });

  msg.question = async (text) => {
    await bot.editMessageText(text, { chat_id: msg.from.id, message_id: msg.message.message_id });
    const def = deferred();
    defferred.push({ user_id: msg.from.id, def });
    return await def.promise(data => data.text);
  };

  if (msg.data == 'changeCategory') {
    bot.editMessageText('Что будем скачивать?', {
      chat_id: msg.from.id,
      message_id: msg.message.message_id,
      ...download
    });
  }
  if (msg.data == 'games') {
    const question = await msg.question('Какую игру вы хотите?')
    const answer = await searchGame(question, msg.from.id);
    await bot.sendMessage(msg.from.id, answer, navButtons('games'))
  }
  if (msg.data == 'progs') {
    const answer = 'В разработке...'
    await bot.sendMessage(msg.from.id, answer, navButtons('progs'))
  }
})