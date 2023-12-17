const telegram = require('node-telegram-bot-api')
// const mongodb = require('./db.js')
const bot = new telegram('5225059269:AAHfU4hsvN3xyJdCYU2yuBuBPunwobztYlM', { polling: true })
const deferred = require('deferred')
const keepAlive = require('./server.js')
const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const fs = require('fs');

const gamesPageUrl = 'https://freetp.org/polnyy-spisok-igr-na-sayte.html';

async function getGameInfo(url, type) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const html = iconv.decode(Buffer.from(response.data), 'windows-1251');
  const $ = cheerio.load(html);

  if (type == 'gameinfo') {
    let gameinfo = [];
    try {
      $('.quote').each((i, elem) => {
        gameinfo.push($(elem).text())
      });
      gameinfo[0] = gameinfo[0].split('\n');
      gameinfo[0] = gameinfo[0].filter((n) => {
        const lowerCaseString = n.toLowerCase();
        return !(lowerCaseString.includes('обзор игры') || lowerCaseString.includes('системные требования')) && !(lowerCaseString == '');
      });
    } catch (error) {
      console.log(error)
    }
    return gameinfo
  } else {
    let gamelinks = [];
    let linksDescriptions = [];

    $('.quote a').each((i, elem) => {
      let href = $(elem).attr('href');
      if (!gamelinks.includes(href)) {
        gamelinks.push(href);
        if ($(elem).parent().hasClass('attachment')) {
          let description = $(elem).parent().text();
          let bracketText = description.match(/\[.*?\]/g);
          if (bracketText) {
            linksDescriptions.push(bracketText.join(' '));
          } else {
            linksDescriptions.push(description);
          }
        } else {
          linksDescriptions.push($(elem).parent().next('p').text());
        }
      }
    });

    $('.attachment > a:nth-child(1)').each((i, elem) => {
      let href = $(elem).attr('href');
      if (!gamelinks.includes(href)) {
        gamelinks.push(href);
        linksDescriptions.push($(elem).parent().next('p').text());
      }
    });

    let urls = [];
    for (let i = 1; i < gamelinks.length; i++) {
      const parts = gamelinks[i].split('//freetp.org/getfile-');
      if (parts[1]) {
        let id = parts[1].split('https://')[0];
        id = id.replace(/\D/g, '');
        if (id) {
          urls.push(linksDescriptions[i]);
          urls.push(`https://freetp.org/engine/download.php?id=${id}&area=`);
        }
      }
    }
    return urls;


  }
}

async function fetchPages(type) {
  if (type == 'games') {
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

    console.log('[ FreeTP ] Список игр получен. Начинаю загружать данные...')

    for (let i = 0; i < list.length; i++) {
      // получаем описание игры
      let description = await getGameInfo(list[i]['url'], 'gameinfo')
      list[i]['description'] = description[0];

      // получаем ссылки на скачку
      let links = await getGameInfo(list[i]['url'], 'gamelinks')
      list[i]['links'] = links;

      console.log(list[i]['description']);
      // выводим прогресс загрузки
      const progress = ((i / list.length) * 100).toFixed(1);
      console.log(`[ FreeTP ] Загружено: ${progress}%`);
    }

    const json = JSON.stringify(list);
    fs.writeFileSync('data.json', json, 'utf-8');

    console.log('[ FreeTP ] Данные успешно загружены, и сохранены.')
  }
}

fetchPages('games');

setInterval(() => {
  fetchPages('games');
}, 3600000)

// mongodb.connect()
//   .then(console.log)
//   .catch(console.error)

var options = {
  reply_markup: JSON.stringify({
    resize_keyboard: true,
    keyboard: [
      [{ text: 'Облако', callback_data: null },
      { text: 'Discord', callback_data: null },
      { text: 'Музыка', callback_data: null },
      { text: 'Скачать', callback_data: null }],
    ]
  })
};

var download = {
  reply_markup: JSON.stringify({
    inline_keyboard: [
      [{ text: 'Игры', callback_data: 'games' }],
      [{ text: 'Приложения', callback_data: 'progs' }],
    ]
  })
};

function navButtons(category) {
  return {
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [{ text: 'Найти заного ◀️', callback_data: category }],
        [{ text: 'Изменить категорию 📄', callback_data: 'changeCategory' }],
      ]
    })
  };
}

let defferred = []

function startSession(id) {
  data = {}
  data['chatid'] = id;
  data['buffer'] = []
  localData.push(data);
}

let localData = []
bot.on('message', async (msg) => {
  if (!localData.find(x => x.chatid === msg.chat.id)) {
    startSession(msg.chat.id);
  }


  let defferredI = false
  defferred.forEach(async (data) => {
    if (data.user_id == msg.chat.id) {
      defferredI = true
      data.def.resolve(msg);
      return defferred.splice(defferred.indexOf(data), 1);
    }
  });

  msg.question = async (text) => {
    await bot.editMessageText(text, { chat_id: msg.from.id, message_id: msg.message.message_id });
    let def = deferred();
    defferred.push({ user_id: msg.from.id, def: def });
    return await def.promise((data) => { return data.text; });
  }

  if (defferredI) {
    return true;
  }

  const chatId = msg.chat.id;
  // if (await mongodb.findUser(chatId) == null) {
  //   await mongodb.saveUser(chatId)
  // }

  // let user = await mongodb.findUser(chatId)

  if (msg.text === '/start') {
    await bot.sendMessage(chatId, "Привет. Я бот, созданный для загрузки игр/приложений на ваш ПК.")
    await bot.sendMessage(chatId, "Выберите опцию: ", options)
  }

  else if (msg.text === 'Скачать') {
    localData.find(x => x.chatid === msg.chat.id).buffer = []
    await bot.sendMessage(chatId, 'Что будем скачивать?', download)
  }

  else if (localData.find(x => x.chatid === msg.chat.id).buffer.length !== 0) {

    if (Number(msg.text)) {
      if (Number(msg.text) <= localData.find(x => x.chatid === msg.chat.id).buffer.length && Number(msg.text) >= 1) {
        const info = await localData.find(x => x.chatid === msg.chat.id).buffer[Number(msg.text - 1)];
        let text = '';

        text += info.title + '\n\n';

        info.description.forEach(item => {
          text += item + '\n';
        });

        text += '\n';

        info.links.forEach(url => {
          text += url + '\n';
        });

        console.log(text);
        await bot.sendMessage(chatId, text);
        localData.find(x => x.chatid === msg.chat.id).buffer = []
      }
      else {
        await bot.sendMessage(chatId, `Выберете пожалуйста номер игры от 1 до ${localData.find(x => x.chatid === msg.chat.id).buffer.length}.`)
      }
    }
    else {
      await bot.sendMessage(chatId, `${msg.text} не является числом.  \nВыберете пожалуйста номер игры от 1 до ${localData.find(x => x.chatid === msg.chat.id).buffer.length}.`)
    }
  }

  else if (msg.text === 'Discord') bot.sendMessage(chatId, "📨 https://discord.gg/M7MqQhhu5j 📨");
  else if (msg.text === 'Облако') {
    await bot.sendMessage(chatId, "Ваше хранилище:")
  }

  else bot.sendMessage(chatId, "Что это?")
})

async function findTitle(prompt, id) {
  let parseData = JSON.parse(fs.readFileSync('data.json', 'utf8'));
  let found = false;
  let result = '';
  let numbering = 1;
  localData.find(x => x.chatid === id).buffer = [];
  for (let i = 0; i <= parseData.length; i++) {
    try {
      if (parseData[i].title.toUpperCase().includes(prompt.toUpperCase())) {
        found = true;
        result += `${numbering++}. ${parseData[i].title}\n`;
        localData.find(x => x.chatid === id).buffer.push(parseData[i])

      }
    } catch (error) { }
  }

  if (found) {
    return ('Результаты поиска:\n' + result);
  }
  else return ('Ничего не найдено.')
}


setInterval(() => {
  console.log(localData)
}, 1000)

bot.on('callback_query', async (msg) => {

  defferred.forEach(async (data) => {
    if (data.user_id == msg.from.id) {
      data.def.resolve(msg);
      return defferred.splice(defferred.indexOf(data), 1);
    }
  });

  msg.question = async (text) => {
    await bot.editMessageText(text, { chat_id: msg.from.id, message_id: msg.message.message_id });
    let def = deferred();
    defferred.push({ user_id: msg.from.id, def: def });
    return await def.promise((data) => { return data.text; });
  }

  if (msg.data == 'changeCategory') {
    await bot.sendMessage(msg.from.id, 'Что будем скачивать?', download)
  }
  if (msg.data == 'games') {
    const question = await msg.question('Какую игру вы хотите?')
    const answer = await findTitle(question, msg.from.id);
    await bot.sendMessage(msg.from.id, answer, navButtons('games'))
  }
  if (msg.data == 'progs') {
    const answer = 'В разработке...'
    await bot.sendMessage(msg.from.id, answer, navButtons('progs'))
  }
});

keepAlive();
