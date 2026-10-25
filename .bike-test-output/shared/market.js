export const MARKET_CATEGORIES = { worlds: 'ワールド', items: 'アイテム', sounds: 'サウンドボード', emotes: 'エモート' };
/** Fictional creators and locally bundled content for the marketplace UX prototype. */
export const MARKET_PRODUCTS = [
    { id: 'bike', category: 'items', content: 'bike', kind: 'bike', text: 'E: 乗降 / W: アクセル / S: ブレーキ / A・D: ハンドル', name: 'バイク', creator: 'Tonarium', price: 150, mark: '単車', color: '#DBEAE7', ink: '#235E57', description: '街や庭を走れる一人乗りバイク。3D 専用。アクセルとブレーキ、ハンドルで運転し、急旋回では車体が傾いて滑ります。' },
    { id: 'star-lounge', category: 'worlds', content: 'starlounge', name: '星あかりのラウンジ', creator: 'hoshi studio', price: 800, mark: '☾', color: '#DBE1F4', ink: '#354879', description: '星の灯りに包まれる、夜の小さな集会所。青い床と光る星を眺めながら、いつもの仲間とゆっくり話そう。' },
    { id: 'talk-card', category: 'items', content: 'talk-card', text: 'おしゃべりカード\n最近、ちょっとうれしかったことは？\n次の人への質問も書いてみよう。', name: 'おしゃべりカード', creator: 'mugi', price: 150, mark: '☏', color: '#F8E5B7', ink: '#705620', description: '初めましての会話に、小さなきっかけを。質問入りの付箋を置いて、みんなで書き換えながら使えるカード。' },
    { id: 'welcome-note', category: 'items', content: 'welcome-note', text: 'ようこそ！\nここではのんびりお話ししています。\n初めての方も、気軽にどうぞ。', name: 'ようこそのメッセージ', creator: 'mugi', price: 100, mark: '✎', color: '#E2EDDA', ink: '#43663C', description: '部屋に来た人を迎える、編集できるメッセージ付箋。挨拶や今日の予定を自由に書き込めます。' },
    { id: 'sparkle-sound', category: 'sounds', content: 'sparkle', name: 'きらめきチャイム', creator: 'oto no niwa', price: 200, mark: '♫', color: '#DCEEF0', ink: '#32636D', description: 'いいことがあった瞬間に、きらきらと上がる短いチャイム。近くにいる人にも聞こえます。' },
    { id: 'fanfare-sound', category: 'sounds', content: 'fanfare', name: '小さなファンファーレ', creator: 'oto no niwa', price: 250, mark: '♬', color: '#F5DECC', ink: '#865330', description: 'ゲームの勝利や友達のお祝いに。軽やかな電子音で、ひと区切りをにぎやかに。' },
    { id: 'cheer-emote', category: 'emotes', content: 'cheer', name: 'ばんざい！', creator: 'riku motion', price: 300, mark: '🙌', color: '#F6DFE9', ink: '#883F62', description: '両手を上げて、うれしい気持ちを伝えるエモート。2D のアイコンでも 3D のアバターでも使えます。' },
    { id: 'bow-emote', category: 'emotes', content: 'bow', name: 'ぺこり', creator: 'riku motion', price: 200, mark: '🌷', color: '#E8E1F3', ink: '#665185', description: '「ありがとう」も「よろしく」も、やさしくおじぎで。会話を邪魔しない、短いご挨拶。' },
];
export const productFor = (category, content) => MARKET_PRODUCTS.find((p) => p.category === category && p.content === content);
export const contentAvailable = (owned, category, content) => {
    const product = productFor(category, content);
    return !product || owned.includes(product.id);
};
export function cleanPurchases(value) {
    return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === 'string' && MARKET_PRODUCTS.some((p) => p.id === id)))] : [];
}
