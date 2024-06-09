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

module.exports = { options, download, navButtons };