var options = {
    reply_markup: JSON.stringify({
        resize_keyboard: true,
        keyboard: [
            [{ text: 'Discord', callback_data: null },
            { text: 'Скачать', callback_data: null }],
        ]
    })
};

var download = {
    reply_markup: JSON.stringify({
        inline_keyboard: [
            [{ text: 'Игры', callback_data: 'games' }],
        ]
    })
};

function navButtons(category) {
    return {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{ text: 'Найти заново ◀️', callback_data: category }],
            ]
        })
    };
}

module.exports = { options, download, navButtons };