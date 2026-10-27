export type PrewrittenTopic = 'greeting' | 'farewell' | 'thanks' | 'apology' | 'praise' | 'wellbeing' | 'tired' | 'worried' | 'lonely' | 'encouragement' | 'values' | 'travelAdvice' | 'theftEthics' | 'mana';
export type PrewrittenTone = 'host' | 'trade' | 'forge' | 'scholar' | 'priest' | 'leader' | 'covert' | 'neighbour';

type LocalizedLines = Record<'ko' | 'en' | 'ja', readonly string[]>;
const lines = (ko: readonly [string, string], en: readonly [string, string], ja: readonly [string, string]): LocalizedLines => ({ ko, en, ja });

export const NPC_PREWRITTEN_TEXT: Record<PrewrittenTone, Record<PrewrittenTopic, LocalizedLines>> = {
  host: {
    apology: lines(
      ["말해 줘서 고마워. 무슨 일이 있었는지 천천히 들어 볼게.", "너무 서두르지 말고 이야기해. 네 말을 듣고 있어."],
      ["Thank you for saying that. Take your time telling me what happened.", "Take a breath and tell me. I'm listening."],
      ["そう言ってくれてありがとう。何があったのか、ゆっくり聞かせて。", "慌てなくていいよ。話を聞いているから。"]),
    praise: lines(
      ["그렇게 말해 주니 기쁘네. 고마워.", "아이, 쑥스럽게. 그래도 들으니 기분 좋네."],
      ["That's kind of you. Thank you.", "Oh, you'll make me blush. It's lovely to hear, though."],
      ["そう言ってもらえるとうれしいな。ありがとう。", "そんなに褒められると照れるよ。でも、うれしいな。"]),
    greeting: lines(
      ["어서 와. 반가워.", "안녕. 만나서 반가워."],
      ["Hello there. Welcome.", "Hello. It's lovely to see you."],
      ["こんにちは。いらっしゃい。", "こんにちは。会えてうれしいよ。"]),
    farewell: lines(
      ["잘 가. 가는 길 조심하고.", "다음에 또 보자. 몸도 잘 챙기고."],
      ["Take care. Have a safe journey.", "See you again. Look after yourself."],
      ["またね。気をつけて帰ってね。", "また会おうね。体に気をつけて。"]),
    thanks: lines(
      ["천만에. 도움이 됐다니 다행이야.", "뭘, 고마워할 것 없어."],
      ["You're welcome. I'm glad I could help.", "Oh, you're welcome. Don't mention it."],
      ["どういたしまして。役に立ててよかった。", "いいんだよ。そんなに気を遣わないで。"]),
    wellbeing: lines(
      ["잘 지내. 너는 어때?", "나야 괜찮지. 이렇게 이야기 나누니 좋네."],
      ["I'm well, thank you. How are you?", "I'm doing well. It's nice to have a chat."],
      ["元気だよ。あなたはどう？", "私は元気。こうして話せるのはいいね。"]),
    tired: lines(
      ["지쳤구나. 잠깐 쉬어 가도 괜찮아.", "오늘은 조금 쉬어. 억지로 괜찮은 척하지 않아도 돼."],
      ["Sounds like you're tired. It's all right to take a break.", "Give yourself a little rest. You don't have to pretend you're fine."],
      ["疲れたんだね。少し休んでもいいんだよ。", "今日は少し休もう。無理に平気なふりをしなくていいよ。"]),
    worried: lines(
      ["무슨 일이 마음에 걸려? 천천히 말해 봐.", "혼자서 다 정리하려고 애쓰지 마. 이야기하면서 생각해도 돼."],
      ["What's worrying you? Take your time telling me.", "You don't have to sort it all out alone. We can talk it through."],
      ["何が気になっているの？ゆっくり話して。", "独りで全部考えなくてもいいよ。話しながら整理していこう。"]),
    lonely: lines(
      ["그럴 땐 사소한 이야기라도 나누고 싶지. 편하게 말해.", "내가 듣고 있어. 특별한 이야기가 아니어도 괜찮아."],
      ["Sometimes you just need someone to talk to. Go ahead, I'm listening.", "I'm here to listen. It doesn't have to be anything special."],
      ["そういう時は、何でもない話でもしたくなるよね。気楽に話して。", "聞いているよ。特別な話じゃなくても大丈夫。"]),
    encouragement: lines(
      ["너무 서두르지 마. 할 수 있는 것부터 하나씩 해 보면 돼.", "남들 속도에 맞추려고 애쓰지 않아도 돼. 네 걸음으로 가."],
      ["There's no need to rush. Start with one thing you can manage.", "You don't have to keep up with everyone else. Go at your own pace."],
      ["そんなに急がなくていいよ。できることから、一つずつやってみよう。", "誰かに合わせて無理しなくていいんだよ。自分のペースで進もう。"]),
    values: lines(
      ["나는 사람 이야기를 끝까지 듣는 게 중요하다고 생각해. 다 듣기도 전에 판단하고 싶진 않거든.", "누구든 편하게 말할 수 있으면 좋겠어. 작은 이야기라고 가볍게 넘기고 싶지 않아."],
      ["I value listening to people. I'd rather hear them out before making up my mind.", "I want people to feel at ease with me. Even a small story deserves to be heard."],
      ["人の話を最後まで聞くことを大切にしているよ。聞き終わる前に決めつけたくないから。", "誰でも安心して話せるといいな。小さな話だからって、聞き流したくないんだ。"]),
    travelAdvice: lines(
      ["긴 여행이라면 먹거리와 쉴 곳부터 알아봐. 지친 뒤에 찾으려면 더 힘들잖아.", "가는 길만 보지 말고 돌아올 길도 생각해 둬. 도중에 쉬어 갈 여유도 남기고."],
      ["For a long journey, plan your food and rest stops first. It's harder to do that when you're already tired.", "Think about getting back as well as getting there. Leave yourself time to rest on the way."],
      ["長旅なら、食べ物と休める場所を先に調べておいてね。疲れてから探すのは大変だから。", "行きだけじゃなく、帰りの道も考えておこう。途中で休む余裕も残してね。"]),
    theftEthics: lines(
      ["남의 물건은 먼저 허락을 받아야지. 필요한 게 있으면 말로 부탁해 봐.", "난 몰래 가져가는 건 좋지 않다고 생각해. 그 물건의 주인도 곤란해질 수 있잖아."],
      ["You should ask the owner first. If you need something, try asking for it.", "I don't think taking it in secret is right. You could leave its owner in a difficult spot."],
      ["人の物は、まず持ち主に聞かないとね。必要なら、言葉で頼んでみよう。", "黙って持っていくのはよくないと思うな。持ち主が困ってしまうかもしれないでしょう。"]),
    mana: lines(
      ["마나는 마법을 쓰거나 몸을 강화할 때 다루는 힘이야. 제대로 써 보는 경험이 중요하다고 해.", "마나는 마법이나 몸을 강화할 때 쓰는 힘이야. 실제로 도움이 되게 쓰는 경험이 중요하다고 해."],
      ["Mana is a force used for magic and strengthening the body. Learning to use it well takes practical experience.", "Mana is used for magic and strengthening the body. They say control grows through useful practice, not simply using it all up."],
      ["マナは、魔法を使ったり体を強めたりするための力だよ。実際に役立つ使い方を重ねることが大切なんだって。", "マナは魔法や体を強めるための力だよ。役立つ使い方を重ねて、扱い方を覚えていくんだって。"]),
  },
  trade: {
    apology: lines(
      ["말씀해 주셔서 고마워요. 어떤 일이었는지 먼저 듣고 싶네요.", "사정은 차분히 말씀해 주세요. 확인할 일이 있다면 하나씩 살펴보죠."],
      ["Thank you for saying so. I'd like to hear what happened first.", "Tell me what happened. We can go through anything that needs checking."],
      ["そう言ってくださってありがとうございます。まずは事情を聞かせてください。", "落ち着いてお話しください。確かめることがあれば、一つずつ見ていきましょう。"]),
    praise: lines(
      ["좋게 봐 주셔서 고마워요. 그런 말씀은 힘이 되네요.", "고마워요. 빈말이라도 기분은 좋네요."],
      ["Thank you. It's encouraging to hear that.", "You're very kind. Even a little flattery brightens the day."],
      ["そう言っていただけて、励みになります。ありがとうございます。", "ありがとうございます。お世辞でも、うれしいものですね。"]),
    greeting: lines(
      ["어서 오세요. 반가워요.", "안녕하세요. 만나서 반가워요."],
      ["Hello, welcome.", "Hello. Good to see you."],
      ["こんにちは。いらっしゃいませ。", "こんにちは。お会いできてうれしいです。"]),
    farewell: lines(
      ["조심히 가세요. 다음에 또 뵈어요.", "안녕히 가세요. 가는 길 조심하시고요."],
      ["Take care. See you again.", "Goodbye. Have a safe journey."],
      ["お気をつけて。またお会いしましょう。", "では、また。道中お気をつけください。"]),
    thanks: lines(
      ["천만에요. 도움이 됐다니 다행이네요.", "별말씀을요. 편하게 말씀하세요."],
      ["You're welcome. I'm glad that helped.", "Not at all. Feel free to ask."],
      ["どういたしまして。お役に立ててよかったです。", "とんでもない。どうぞお気軽に。"]),
    wellbeing: lines(
      ["잘 지내요. 이렇게 말 걸어 주시니 반갑네요.", "저는 괜찮아요. 그쪽은 어떠세요?"],
      ["I'm well. It's nice of you to stop and chat.", "I'm doing well, thank you. How about you?"],
      ["元気ですよ。声をかけていただけてうれしいです。", "私は元気です。そちらはいかがですか。"]),
    tired: lines(
      ["피곤할 땐 큰 결정을 잠깐 미루세요. 쉬고 나면 생각이 좀 정리되기도 하니까요.", "피곤하시군요. 계산도 판단도 잠깐 내려놓고 쉬세요."],
      ["Leave any big decisions until you've rested. A clear head can make a difference.", "You sound tired. Put the sums and decisions aside for a moment."],
      ["疲れている時は、大きな決断を少し後にしましょう。休むと考えもまとまりやすいですから。", "お疲れのようですね。勘定も考え事も、ひとまず置いて休んでください。"]),
    worried: lines(
      ["뭐가 제일 걱정되세요? 확인할 수 있는 것부터 같이 살펴보죠.", "아직 모르는 일까지 한꺼번에 걱정하면 힘들어요. 확실한 것부터 정리해 보세요."],
      ["What's worrying you most? Let's start with what can be checked.", "It's hard to worry about every unknown at once. Start with what you do know."],
      ["何が一番気になりますか。確かめられることから見てみましょう。", "まだ分からないことまで一度に考えると大変ですよ。分かっていることから整理してみてください。"]),
    lonely: lines(
      ["꼭 용건이 있어야 이야기하는 건 아니죠. 편하게 말 걸어 주세요.", "사람 만나는 일에 셈만 할 수는 없잖아요. 그냥 이야기하셔도 괜찮아요."],
      ["You don't need to have business with me to talk. Feel free to stay and chat.", "Not every conversation needs to be a bargain. We can just talk."],
      ["用事がなくても、お話ししていいんですよ。気軽に声をかけてください。", "人付き合いは商売だけではありませんから。何でもない話でも大丈夫ですよ。"]),
    encouragement: lines(
      ["할 수 있는 일을 하나 정해서 시작해 보세요. 작게 시작해도 괜찮아요.", "남의 성과와 너무 비교하지 마세요. 자신이 해낸 일도 봐 주셔야죠."],
      ["Choose one manageable thing and begin there. It doesn't have to be a grand start.", "Don't measure everything against someone else's success. Give yourself credit for what you've done."],
      ["できそうなことを一つ選んで、始めてみましょう。小さなことからでいいんですよ。", "人の成果と比べすぎないでください。ご自分ができたことにも目を向けてあげてくださいね。"]),
    values: lines(
      ["저는 신뢰가 중요해요. 이익이 남아도 서로 믿지 못하면 오래 거래하기 어렵죠.", "약속은 지킬 수 있는 만큼 해야 한다고 생각해요. 듣기 좋은 말보다 그게 낫죠."],
      ["Trust matters to me. A profitable bargain won't last if people can't trust each other.", "I believe in promises you can keep. They're worth more than an impressive speech."],
      ["信用を大切にしています。利益が出ても、互いに信用できなければ長くは続きません。", "約束は守れる範囲でするものだと思います。耳当たりのよい言葉より、その方が大事ですね。"]),
    travelAdvice: lines(
      ["출발 전에 준비물과 예산부터 살펴보세요. 돌아올 비용도 남겨 두시고요.", "싸게 갈 수 있다는 말만 믿지는 마세요. 경로와 필요한 준비를 직접 확인하는 게 좋아요."],
      ["Check your supplies and budget before leaving. Keep enough for the return as well.", "Don't choose a route just because someone calls it cheap. Check the route and the preparation it needs."],
      ["出発前に持ち物と予算を確認してください。帰りの費用も残しておいてくださいね。", "安く行けるという話だけで決めない方がいいですよ。道筋と必要な支度を、ご自分でも確かめてください。"]),
    theftEthics: lines(
      ["허락 없이 가져가는 건 거래가 아니죠. 필요한 게 있다면 주인과 먼저 이야기해 보세요.", "필요하다고 해서 남의 물건이 내 것이 되지는 않아요. 서로 납득할 방법을 찾아보세요."],
      ["Taking something without permission isn't a bargain. Speak to its owner first.", "Needing something doesn't make it yours. Look for an arrangement you can both accept."],
      ["許可なく持っていくのは取引ではありません。必要なら、まず持ち主と話してみてください。", "必要だからといって、人の物が自分の物になるわけではありません。お互いに納得できる方法を考えましょう。"]),
    mana: lines(
      ["마나는 마법이나 신체 강화에 쓰는 힘이에요. 얼마나 쓰느냐보다 어떻게 쓰는지가 중요하다고 하죠.", "마나는 마법과 신체 강화에 사용하는 힘이에요. 이를 제대로 쓰는 경험으로 다루는 능력이 자란다고 하죠."],
      ["Mana is used for magic and physical strengthening. How you use it matters more than simply how much you spend.", "Mana is a force used for magic and physical strengthening. Control is said to grow through effective use rather than expenditure alone."],
      ["マナは魔法や身体の強化に使う力です。使う量より、どう使うかが大事だそうですよ。", "マナは魔法や身体の強化に使う力です。役立つ使い方を重ねると、扱う力も育つそうですよ。"]),
  },
  forge: {
    apology: lines(
      ["들었네. 무슨 일인지부터 말해 보게.", "말은 알겠네. 바로잡을 게 있다면 그 일부터 살펴보세."],
      ["I hear you. Tell me what happened first.", "Understood. If something needs putting right, let's start there."],
      ["分かった。まず、何があったか話してくれ。", "言いたいことは分かった。直すべきことがあるなら、そこから考えよう。"]),
    praise: lines(
      ["허, 듣기 좋군. 고맙네.", "고맙네. 그런 말은 영 쑥스럽구먼."],
      ["Hah, good to hear. Thank you.", "Thanks. Never quite know what to say to praise."],
      ["はは、うれしいことを言ってくれる。ありがとな。", "ありがとな。褒められるのは、どうも照れくさい。"]),
    greeting: lines(
      ["반갑네.", "안녕하신가."],
      ["Hello there.", "Good to see you."],
      ["よう。", "こんにちは。"]),
    farewell: lines(
      ["잘 가게. 조심해서 가고.", "또 보세. 너무 서두르지는 말고."],
      ["Take care. Travel safely.", "See you again. Don't be in too much of a hurry."],
      ["気をつけてな。", "またな。あまり急ぐなよ。"]),
    thanks: lines(
      ["됐네. 도움이 됐다면 그걸로 충분해.", "별말을 다 하는군. 마음 쓸 것 없네."],
      ["Glad it helped. That'll do.", "No need to thank me. Think nothing of it."],
      ["役に立ったなら、それでいい。", "礼ならもう十分だ。気にするな。"]),
    wellbeing: lines(
      ["나야 괜찮네. 자네는 어떤가?", "잘 지내네. 별걱정 말게."],
      ["Well enough. How about you?", "I'm all right. No need to worry about me."],
      ["まあ、元気だ。そっちはどうだ。", "変わりない。心配はいらん。"]),
    tired: lines(
      ["지쳤으면 손을 놓게. 피곤할 때는 다치기 쉽네.", "억지로 밀어붙이지 말게. 쉬고 다시 하는 편이 낫지."],
      ["Set the work down if you're tired. That's when accidents happen.", "Don't force it. Rest, then come back to it."],
      ["疲れたなら手を止めろ。そういう時に怪我をする。", "無理に続けるな。休んでからやればいい。"]),
    worried: lines(
      ["뭐가 제일 걱정인가? 하나씩 짚어 보세.", "짐작만으로 결론 내리지 말게. 확인할 수 있는 것부터 보면 되네."],
      ["What's troubling you most? Let's take it one thing at a time.", "Don't decide on guesswork. Start with what you can check."],
      ["何が一番気になる。一つずつ考えよう。", "推測だけで決めるな。確かめられることから見ればいい。"]),
    lonely: lines(
      ["말재주는 없어도 들어줄 수는 있네. 편히 말하게.", "혼자서만 버틸 필요는 없네. 하고 싶은 말이 있으면 하게."],
      ["I'm no great talker, but I can listen. Go on.", "You needn't carry it all alone. Say what's on your mind."],
      ["口はうまくないが、聞くことはできる。話してみろ。", "独りで抱えることはない。話したいことがあるなら話せ。"]),
    encouragement: lines(
      ["서툴러도 괜찮네. 잘 안되는 곳부터 차근차근 고치면 되지.", "처음부터 잘하는 사람은 드무네. 기초를 익히고 다시 해 보게."],
      ["It's all right to be clumsy at first. Work carefully on what needs fixing.", "Few people get it right straight away. Learn the basics and try again."],
      ["初めは不慣れでいい。うまくいかない所から、丁寧に直していけ。", "最初からできる者は少ない。基礎を覚えて、またやってみろ。"]),
    values: lines(
      ["정직하고 꼼꼼한 일을 중시하네. 겉만 번듯한 물건은 믿지 않아.", "내겐 쓸모와 마무리가 중요하네. 안 보이는 곳이라고 대충 해선 안 되지."],
      ["I value honest, careful work. A fine-looking surface isn't enough.", "Use and finish matter to me. Being out of sight is no excuse for poor work."],
      ["実直で丁寧な仕事を大事にする。見栄えだけでは信用できん。", "使い勝手と仕上げが大事だ。見えない所だからと、雑にしてはいけない。"]),
    travelAdvice: lines(
      ["떠나기 전에 장비부터 살피게. 작은 고장도 길 위에서는 성가신 법이네.", "멋만 보고 장비를 고르지 말게. 자네가 잘 다룰 수 있는 게 좋지."],
      ["Check your equipment before leaving. A small fault can be a nuisance on the road.", "Don't choose equipment just for its looks. Take what you can handle properly."],
      ["出発前に装備を確かめろ。小さな不具合も、道中では厄介になる。", "見た目だけで道具を選ぶな。自分で扱いやすい物がいい。"]),
    theftEthics: lines(
      ["난 반대네. 필요한 게 있으면 주인에게 먼저 물어보게.", "남의 물건에는 그 사람의 수고가 들어 있네. 몰래 가져가서는 안 되지."],
      ["I'm against it. If you need something, ask the owner first.", "Someone put work into that. Don't take it behind their back."],
      ["賛成はできん。必要なら、まず持ち主に聞け。", "その物には、持ち主の苦労がある。黙って持っていくものではない。"]),
    mana: lines(
      ["마나는 마법이나 몸을 강화하는 기술에 쓰는 힘이네. 실제로 잘 써 보는 경험이 중요하지.", "마나는 마법이나 몸을 강화하는 기술에 쓰는 힘이네. 쓰는 솜씨는 실제로 효과를 내는 경험을 통해 느는 거지."],
      ["Mana is used for magic and techniques that strengthen the body. You learn by putting it to good use.", "Mana powers magic and techniques that strengthen the body. Using it effectively is what develops your control."],
      ["マナは魔法や、体を強める技に使う力だ。実際にうまく使う経験が大事になる。", "マナは魔法や、体を強める技に使う力だ。マナを扱う力は、実際に役立てる経験で伸びていく。"]),
  },
  scholar: {
    apology: lines(
      ["말씀은 잘 들었어요. 어떤 일이었는지 설명해 주시겠어요?", "알겠어요. 오해가 있었다면 서로의 말을 차분히 확인해 봐요."],
      ["I hear you. Could you explain what happened?", "I understand. If there was a misunderstanding, we can talk it through carefully."],
      ["お気持ちは分かりました。何があったのか、聞かせていただけますか。", "分かりました。行き違いがあったのなら、落ち着いて確かめましょう。"]),
    praise: lines(
      ["고마워요. 그런 말을 들으니 조금 쑥스럽네요.", "좋게 말씀해 주셔서 고마워요. 기억해 둘게요."],
      ["Thank you. I admit that's a little embarrassing to hear.", "That's kind of you to say. I'll remember it."],
      ["ありがとうございます。そう言われると、少し照れますね。", "温かいお言葉をありがとうございます。覚えておきます。"]),
    greeting: lines(
      ["안녕하세요. 반갑습니다.", "안녕하세요. 만나서 반가워요."],
      ["Hello. Nice to see you.", "Hello there. Welcome."],
      ["こんにちは。お会いできてうれしいです。", "こんにちは。お話しできてうれしいです。"]),
    farewell: lines(
      ["조심히 가세요. 다음에 또 뵈어요.", "안녕히 가세요. 또 이야기 나눠요."],
      ["Take care. I hope we'll speak again.", "Goodbye. It was nice talking with you."],
      ["お気をつけて。またお会いしましょう。", "それでは、またお話ししましょう。"]),
    thanks: lines(
      ["천만에요. 도움이 되었다니 다행이에요.", "별말씀을요. 궁금한 것이 풀렸다면 좋겠네요."],
      ["You're welcome. I'm glad it was useful.", "Not at all. I hope that cleared things up."],
      ["どういたしまして。お役に立ててよかったです。", "いえいえ。疑問が解けたなら何よりです。"]),
    wellbeing: lines(
      ["잘 지내고 있어요. 안부를 물어 주셔서 고마워요.", "저는 괜찮아요. 그쪽은 어떻게 지내세요?"],
      ["I'm doing well. Thank you for asking.", "I'm quite well, thank you. How are you?"],
      ["元気にしています。お気遣いありがとうございます。", "私は元気です。そちらはいかがですか。"]),
    tired: lines(
      ["피곤할 때는 익숙한 내용도 놓치기 쉬워요. 잠시 쉬었다가 다시 보세요.", "집중이 잘 안될 만큼 지쳤다면 쉬는 게 좋겠어요. 서두를 필요는 없어요."],
      ["It's easy to miss familiar details when you're tired. Take a break before you return to it.", "If you're too tired to concentrate, a little rest may help. There's no need to rush."],
      ["疲れていると、慣れたことでも見落としやすいですよ。少し休んでから、また見てみましょう。", "集中できないほど疲れたなら、休んだ方がよさそうです。急ぐ必要はありませんよ。"]),
    worried: lines(
      ["무슨 일이 걱정되세요? 아는 것과 아직 모르는 것을 나눠 보면 도움이 될 거예요.", "당장 결론을 내리지 않아도 괜찮아요. 먼저 확인할 수 있는 것부터 살펴보죠."],
      ["What's worrying you? Separating what you know from what you don't may help.", "You needn't reach a conclusion straight away. Let's begin with what can be checked."],
      ["何が心配ですか。分かっていることと、まだ分からないことを分けてみるとよいかもしれません。", "すぐに結論を出さなくても大丈夫です。まず、確かめられることから見ていきましょう。"]),
    lonely: lines(
      ["거창한 주제가 아니어도 괜찮아요. 편하게 이야기해 주세요.", "하고 싶은 이야기가 있으면 들려주세요. 정리되지 않은 말이어도 괜찮아요."],
      ["It needn't be a serious subject. You're welcome to talk.", "Tell me what's on your mind. It doesn't have to be neatly thought out."],
      ["難しい話題でなくても大丈夫です。気楽にお話しください。", "話したいことがあれば聞かせてください。まだうまくまとまっていなくても大丈夫ですよ。"]),
    encouragement: lines(
      ["처음부터 모든 것을 알 필요는 없어요. 하나씩 알아가면 되니까요.", "실수했다면 어디서 어려웠는지 살펴보세요. 다시 시도할 때 도움이 될 거예요."],
      ["You don't need to know everything at the beginning. You can learn one thing at a time.", "If you made a mistake, look at what gave you trouble. It may help with the next attempt."],
      ["最初からすべて知っている必要はありません。一つずつ覚えていけばいいんですよ。", "間違えたなら、どこが難しかったか振り返ってみてください。次に試す時の助けになるはずです。"]),
    values: lines(
      ["확인한 사실과 제 생각을 구분하는 일이 중요해요. 확실하지 않은 것을 아는 척하고 싶지는 않아요.", "저는 정확하게 알고 전하는 것을 중요하게 생각해요. 잘 모르는 것은 모른다고 말하는 편이에요."],
      ["I value knowing the difference between evidence and my own ideas. I'd rather admit when I'm unsure.", "It's important to understand something before passing it on. If I don't know, I'd rather say so."],
      ["確かめた事実と、自分の考えを分けることを大切にしています。分からないことを、知っているふりはしたくありません。", "正しく理解して伝えることが大切だと思います。知らないことは、知らないと言うようにしています。"]),
    travelAdvice: lines(
      ["출발 전에 경로를 확인하세요. 모르는 구간이 있다면 따로 알아보는 게 좋겠어요.", "준비물뿐 아니라 돌아오는 길도 생각해 두세요. 확인하지 못한 정보는 그대로 믿지 마시고요."],
      ["Check your route before leaving. Find out more about any stretches you don't know.", "Think about the return journey as well as your supplies. Be careful with information you haven't verified."],
      ["出発前に道筋を確認してください。よく知らない区間があれば、先に調べた方がよさそうです。", "持ち物だけでなく、帰り道も考えておきましょう。未確認の話を、そのまま信じないようにしてくださいね。"]),
    theftEthics: lines(
      ["주인의 허락이 있는지 먼저 확인해야 해요. 필요하다는 이유만으로 가져가도 되는 건 아니에요.", "타인의 물건을 몰래 가져가는 일에는 동의하기 어려워요. 당사자와 이야기할 방법부터 찾아보세요."],
      ["Check whether the owner has given permission. Needing it doesn't mean you may take it.", "I can't agree with taking someone else's belongings in secret. Try speaking to the owner first."],
      ["まず、持ち主の許可があるか確かめるべきです。必要だからといって、持っていってよいとは限りません。", "他人の物を黙って持ち去ることには賛成できません。まず、持ち主と話す方法を考えてみてください。"]),
    mana: lines(
      ["마나는 마법과 신체 강화에 사용하는 힘이에요. 실제로 효과를 내며 사용하는 경험을 통해 다루는 능력이 자라요.", "마나는 마법뿐 아니라 신체를 강화하는 데도 쓰는 힘이에요. 무작정 소모하기보다 실제로 효과를 내며 쓰는 경험이 중요해요."],
      ["Mana is a force used for magic and physical enhancement. Control develops through use that has a real effect.", "Mana is used both for magic and for strengthening the body. Useful practice develops control more than simply spending it."],
      ["マナは魔法や身体の強化に使う力です。実際に効果を発揮する使い方を重ねることで、扱う力が育ちます。", "マナは魔法や身体の強化に使う力です。やみくもに消耗させるより、実際に効果を出して使う経験が大切になります。"]),
  },
  priest: {
    apology: lines(
      ["말씀해 주셔서 고마워요. 무슨 일이 있었는지 들어 볼게요.", "마음에 걸리는 일이 있군요. 서두르지 말고 말씀해 주세요."],
      ["Thank you for saying so. Tell me what happened.", "Something is weighing on you. Take your time telling me."],
      ["話してくださってありがとうございます。何があったのか聞かせてください。", "気にかかることがあるのですね。慌てず、お話しください。"]),
    praise: lines(
      ["따뜻한 말씀이네요. 고마워요.", "고마워요. 저도 그 말씀을 소중히 간직할게요."],
      ["Those are kind words. Thank you.", "Thank you. I'll hold on to that kindness."],
      ["温かいお言葉ですね。ありがとうございます。", "ありがとうございます。そのお気持ちを大切にします。"]),
    greeting: lines(
      ["안녕하세요. 반갑습니다.", "안녕하세요. 만나서 반가워요."],
      ["Peace to you. It's good to see you.", "Hello. It's good to speak with you."],
      ["こんにちは。お会いできてうれしく思います。", "こんにちは。お話しできてうれしいです。"]),
    farewell: lines(
      ["조심히 가세요. 평안한 길이 되기를 바랍니다.", "안녕히 가세요. 자신도 잘 돌보시고요."],
      ["Take care. May your journey be peaceful.", "Goodbye. Remember to look after yourself."],
      ["お気をつけて。穏やかな旅になりますように。", "それでは、また。ご自分のことも大切にしてくださいね。"]),
    thanks: lines(
      ["천만에요. 도움이 되었다면 다행입니다.", "고맙게 생각해 주셔서 저도 감사해요."],
      ["You're welcome. I'm glad I could help.", "Thank you for saying so. I appreciate it."],
      ["どういたしまして。お力になれたなら幸いです。", "そう言ってくださって、こちらこそありがとうございます。"]),
    wellbeing: lines(
      ["저는 잘 지내고 있어요. 안부를 물어 주셔서 고맙습니다.", "괜찮습니다. 그쪽은 어떻게 지내세요?"],
      ["I'm well. Thank you for asking after me.", "I'm doing well, thank you. How are you keeping?"],
      ["元気にしています。お気遣いありがとうございます。", "私は元気です。そちらはいかがお過ごしですか。"]),
    tired: lines(
      ["피곤하시군요. 잠시 쉬셔도 괜찮습니다.", "쉬어야 할 때 자신을 탓하지 마세요. 몸과 마음을 돌보는 것도 필요한 일이에요."],
      ["You sound tired. It's all right to rest for a while.", "Don't blame yourself for needing rest. Caring for your body and mind matters too."],
      ["お疲れのようですね。少し休んでもよいのですよ。", "休みが必要だからと、ご自分を責めないでください。体と心をいたわることも大切です。"]),
    worried: lines(
      ["무엇이 마음을 무겁게 하나요? 괜찮다면 들려주세요.", "모든 걱정을 당장 풀어야 하는 것은 아니에요. 가장 마음에 걸리는 것부터 이야기해 보세요."],
      ["What's weighing on your mind? You may tell me, if you wish.", "You needn't settle every worry at once. Start with the one that troubles you most."],
      ["何が心に引っかかっていますか。よければ、お聞かせください。", "すべての心配を、今すぐ解かなくてもよいのです。一番気になることから話してみてください。"]),
    lonely: lines(
      ["외롭다고 말하는 게 쉽지는 않지요. 편하게 이야기해 주세요.", "특별한 용건이 없어도 괜찮아요. 나누고 싶은 말이 있으면 듣겠습니다."],
      ["It isn't always easy to say you're lonely. You're welcome to talk.", "You don't need a particular reason. If you wish to speak, I will listen."],
      ["寂しいと口にするのは、簡単ではありませんね。どうぞ気楽にお話しください。", "特別な用事がなくてもかまいません。お話しになりたいことがあれば、伺います。"]),
    encouragement: lines(
      ["작은 일부터 시작해 보세요. 서두르지 않고 꾸준히 해 나가셔도 됩니다.", "마음처럼 되지 않는 날도 있지요. 자신에게 너무 매섭게 대하지 마세요."],
      ["Begin with something small. You may take your time and keep going steadily.", "Some days don't go as we hope. Try not to be too harsh with yourself."],
      ["小さなことから始めてみてください。急がず、少しずつ続けてもよいのです。", "思うようにいかない日もありますね。ご自分に厳しくしすぎないでください。"]),
    values: lines(
      ["저는 힘든 사람의 이야기를 듣는 일을 소중하게 생각해요. 먼저 판단하기보다 그 사정을 알고 싶습니다.", "말과 행동이 다르지 않으려고 해요. 다정한 말만큼 실제로 남을 배려하는 일도 중요하니까요."],
      ["I value listening to people who are struggling. I'd rather understand their situation before judging.", "I try to let my actions match my words. Kindness matters in what we do as well as what we say."],
      ["困っている方の話を聞くことを大切にしています。判断する前に、その事情を知りたいのです。", "言葉と行いが離れないようにしたいですね。優しい言葉だけでなく、実際の気遣いも大切ですから。"]),
    travelAdvice: lines(
      ["길을 떠나기 전에 먹거리와 쉴 곳을 살펴 두세요. 무리하지 않을 계획도 필요합니다.", "함께 가는 사람이 있다면 서로의 상태를 살펴 주세요. 힘들면 쉬어 갈 수 있도록요."],
      ["Check your food and places to rest before setting out. Leave room in your plans to take things gently.", "If you have companions, look out for one another. Make it possible to stop when someone needs rest."],
      ["旅立つ前に、食べ物と休める場所を確かめておいてください。無理のない予定も必要ですね。", "同行者がいるなら、互いの様子を気にかけてください。疲れた時に休めるようにしておきましょう。"]),
    theftEthics: lines(
      ["남의 물건을 가져가기 전에 그 주인의 사정도 생각해 주세요. 먼저 부탁할 방법을 찾아보면 좋겠어요.", "곤란한 처지라 해도 남을 해치는 선택은 조심해야 합니다. 필요한 것을 정당하게 구할 길부터 찾아보세요."],
      ["Think of the owner before taking their belongings. Try finding a way to ask first.", "Even in difficulty, take care with choices that could hurt someone else. Look first for a fair way to obtain what you need."],
      ["持ち去る前に、持ち主の事情も考えてみてください。まず、頼める方法を探してはいかがでしょう。", "困っている時でも、人を傷つける選択には慎重でありたいですね。必要な物を、正当に得る道から考えてみてください。"]),
    mana: lines(
      ["마나는 마법과 신체 강화에 쓰이는 힘이에요. 올바르게 사용하는 경험을 통해 다루는 능력이 자랍니다.", "마나는 마법과 몸을 강화하는 기술에 사용하는 힘입니다. 제대로 다뤄 보는 경험을 통해 다루는 능력이 자라지요."],
      ["Mana is used in magic and physical strengthening. Control grows through experience in using it effectively.", "Mana is a force used in magic and physical strengthening. Learning to control it takes useful practice, not merely exhausting it."],
      ["マナは魔法や身体の強化に使う力です。適切に使う経験を重ねることで、扱う力が育ちます。", "マナは魔法や、体を強める技に使う力です。きちんと使う経験を通じて、扱う力が育っていきます。"]),
  },
  leader: {
    apology: lines(
      ["알겠네. 무슨 일이 있었는지 정확히 말해 주게.", "사과는 들었네. 손볼 일이 있다면 상황부터 짚어 보세."],
      ["Understood. Tell me exactly what happened.", "I've heard your apology. If something needs addressing, let's establish what happened first."],
      ["分かった。何があったのか、正確に話してくれ。", "謝罪は聞いた。対処が必要なら、まず事情を確かめよう。"]),
    praise: lines(
      ["고맙네. 그렇게 봐 준다니 힘이 되는군.", "좋은 말이군. 그 기대에 부끄럽지 않도록 해야겠네."],
      ["Thank you. That means a good deal.", "Kind words. I'll do my best to live up to them."],
      ["ありがとう。そう思ってもらえるのは励みになる。", "うれしい言葉だ。その期待に恥じないようにしたいものだな。"]),
    greeting: lines(
      ["반갑네.", "안녕하신가. 만나서 반갑네."],
      ["Hello. Good to see you.", "Hello there."],
      ["こんにちは。", "よく来たな。"]),
    farewell: lines(
      ["잘 가게. 가는 길 조심하고.", "또 보세. 너무 무리하지는 말게."],
      ["Take care. Have a safe journey.", "See you again. Don't push yourself too hard."],
      ["気をつけてな。", "またな。あまり無理はするなよ。"]),
    thanks: lines(
      ["도움이 됐다면 다행이네.", "별말을 다 하는군. 고맙게 생각해 주니 나도 좋네."],
      ["I'm glad it helped.", "Don't mention it. I appreciate you saying so."],
      ["役に立ったなら何よりだ。", "気にするな。そう言ってもらえるとうれしい。"]),
    wellbeing: lines(
      ["잘 지내네. 안부를 물어 줘서 고맙군.", "나야 괜찮네. 자네는 어떻게 지내나?"],
      ["I'm doing well. Thank you for asking.", "I'm all right. How are you?"],
      ["元気だ。気にかけてくれて、ありがとう。", "こちらは大丈夫だ。そっちはどうしている。"]),
    tired: lines(
      ["피곤하면 잠깐 쉬게. 지친 채로 서두를 필요는 없네.", "무리를 숨기지는 말게. 언제 쉬어야 하는지 아는 것도 중요하네."],
      ["Take a break if you're tired. There's no need to hurry while worn out.", "Don't hide it if you're struggling. Knowing when to rest matters too."],
      ["疲れたなら少し休め。無理に急ぐことはない。", "無理を隠すな。休む時を知るのも大切だ。"]),
    worried: lines(
      ["뭐가 가장 걱정인가? 지금 할 수 있는 일부터 생각해 보세.", "모든 일을 한꺼번에 해결하려 들지 말게. 먼저 살필 일부터 정하면 되네."],
      ["What's worrying you most? Let's start with what you can do now.", "Don't try to solve everything at once. Decide what needs your attention first."],
      ["何が一番心配だ。今できることから考えよう。", "すべてを一度に片づけようとするな。まず何を見るべきか決めればいい。"]),
    lonely: lines(
      ["혼자 감당해야 한다고 생각하지 말게. 하고 싶은 말이 있으면 듣겠네.", "별다른 용건이 없어도 괜찮네. 잠깐 이야기나 나누세."],
      ["You don't have to bear everything alone. If you wish to talk, I'll listen.", "You don't need to have business with me. We can talk for a while."],
      ["独りで背負わなければと思うな。話したいことがあれば聞くぞ。", "特に用事がなくてもいい。少し話そう。"]),
    encouragement: lines(
      ["감당할 수 있는 목표부터 잡게. 하나씩 해 나가면 되네.", "망설여진다고 자격이 없는 건 아니네. 필요한 준비를 하고 다시 해 보게."],
      ["Choose a goal you can manage. Take it one step at a time.", "Hesitating doesn't mean you're unfit. Make the preparations you need and try again."],
      ["自分にできる目標から決めろ。一つずつ進めばいい。", "ためらったからといって、不向きとは限らん。必要な支度をして、また試せばいい。"]),
    values: lines(
      ["나는 일만큼 사람도 살펴야 한다고 생각하네. 목표만 보다가 누군가 무리하는 걸 놓치면 안 되지.", "누구에게 일을 맡기든 감당할 수 있는지 먼저 보네. 책임을 떠넘기는 건 지휘가 아니지."],
      ["People matter as much as the task. A goal is no excuse to overlook someone who's struggling.", "Before giving someone a task, I consider whether they can manage it. Passing on the blame isn't leadership."],
      ["仕事と同じくらい、人を見ることも大切だ。目標ばかり見て、誰かの無理を見落としてはいけない。", "仕事を任せる前に、その者に無理がないかを考える。責任を押しつけるのは指揮ではない。"]),
    travelAdvice: lines(
      ["떠나기 전에 경로와 돌아올 방법부터 확인하게. 동행이 있다면 모두에게 무리가 없는지도 보고.", "언제 쉬고 언제 돌아설지 미리 생각해 두게. 계속 가는 것만이 좋은 판단은 아니네."],
      ["Check your route and your way back before leaving. If you have companions, make sure the plan works for everyone.", "Decide when to rest and when to turn back before setting out. Going on isn't always the best choice."],
      ["出発前に道筋と帰る方法を確かめろ。同行者がいるなら、皆に無理がないかも見ておけ。", "いつ休み、いつ引き返すかも考えておけ。進み続けることだけが、よい判断ではない。"]),
    theftEthics: lines(
      ["남의 물건에 함부로 손대지 말게. 분쟁이 생기면 주위 사람까지 휘말릴 수 있네.", "필요한 게 있다면 먼저 동의를 구하게. 가져간 뒤에 사정부터 내세워서는 곤란하지."],
      ["Don't help yourself to someone else's belongings. A dispute could draw other people in as well.", "If you need something, seek permission first. Explaining afterward isn't the same thing."],
      ["人の物に勝手に手を出すな。争いになれば、周りまで巻き込むこともある。", "必要なら、まず同意を得ろ。持ち去った後で事情を話すのとは違う。"]),
    mana: lines(
      ["마나는 마법과 신체 강화에 쓰이는 힘이네. 실제로 효과를 내며 사용한 경험이 중요하지.", "마나는 마법이나 신체 강화에 쓰는 힘이네. 얼마나 소모했는지보다 제대로 활용한 경험이 중요하지."],
      ["Mana is used for magic and physical strengthening. Experience in putting it to effective use matters.", "Mana is used for magic and strengthening the body. Useful practice develops control, rather than the amount spent alone."],
      ["マナは魔法や身体の強化に使う力だ。実際に効果を出して使う経験が大切になる。", "マナは魔法や身体の強化に使う力だ。消耗した量より、実際に役立てた経験が大切になる。"]),
  },
  covert: {
    apology: lines(
      ["들었어. 무슨 일인지부터 말해.", "말은 알겠어. 사정은 끝까지 들어 봐야겠네."],
      ["I hear you. Start with what happened.", "I understand the words. I'd like to hear the rest of the story."],
      ["聞いたよ。まずは、何があったか話して。", "言いたいことは分かった。事情は最後まで聞いておきたいね。"]),
    praise: lines(
      ["듣기 좋은 말이네. 고마워.", "그렇게 봐 줬다니 의외네. 칭찬은 받아 둘게."],
      ["Nice to hear. Thanks.", "Didn't expect you to say that. I'll take the compliment."],
      ["悪い気はしないね。ありがとう。", "そう見てくれたとは意外だね。褒め言葉は受け取っておくよ。"]),
    greeting: lines(
      ["반가워.", "안녕."],
      ["Hello.", "Good to see you."],
      ["どうも。", "こんにちは。"]),
    farewell: lines(
      ["조심해서 가.", "다음에 보자. 가는 길 조심하고."],
      ["Take care.", "Until next time. Watch yourself on the road."],
      ["気をつけてな。", "またな。道中、気をつけろよ。"]),
    thanks: lines(
      ["그 정도면 됐어. 너무 신경 쓰지 마.", "알겠어. 도움이 됐다면 됐지."],
      ["That'll do. Don't worry about it.", "All right. Glad it was useful."],
      ["それで十分だ。気にするな。", "分かった。役に立ったならいい。"]),
    wellbeing: lines(
      ["난 괜찮아. 너는 어때?", "나야 잘 지내지. 너무 걱정할 것 없어."],
      ["I'm all right. How about you?", "I'm doing well enough. No need to worry about me."],
      ["こちらは大丈夫だ。そっちはどうだ。", "まあ、元気にしている。気にしなくていい。"]),
    tired: lines(
      ["지쳤으면 잠깐 쉬어. 무리해서 빈틈을 보일 필요는 없지.", "판단이 흐려질 때까지 버티지는 마. 쉬어야 할 때도 알아야지."],
      ["Step back and rest if you're tired. There's no point wearing yourself down.", "Don't keep going until you can't think clearly. Know when to take a break."],
      ["疲れたなら少し休め。無理をして隙を作ることはない。", "頭が回らなくなるまで粘るな。休む時も見極めろ。"]),
    worried: lines(
      ["무슨 일이 걱정이야? 확실한 것부터 이야기해 봐.", "짐작과 사실은 나눠서 생각해. 그래야 어떻게 할지 고를 수 있어."],
      ["What's worrying you? Start with what you know for certain.", "Keep guesses separate from facts. It'll make it easier to decide what to do."],
      ["何が心配なんだ。確かなことから話してみろ。", "推測と事実は分けて考えろ。その方が、どう動くか決めやすい。"]),
    lonely: lines(
      ["말을 나누고 싶은 거라면 그렇게 말해도 돼. 굳이 용건을 만들 필요는 없어.", "다 말하라고 하진 않을게. 편하게 이야기할 수 있는 만큼만 해."],
      ["If you want someone to talk to, just say so. You don't need an excuse.", "You don't have to tell me everything. Share as much as you're comfortable with."],
      ["話し相手が欲しいなら、そう言っていい。無理に用事を作ることはない。", "全部話せとは言わない。話してもいいと思う分だけでいい。"]),
    encouragement: lines(
      ["네가 할 수 있는 일부터 해. 남의 기대를 전부 맞출 필요는 없어.", "확신이 안 서면 준비부터 해. 성급하게 나서는 것보다 낫지."],
      ["Start with what you can do. You don't have to meet everyone's expectations.", "If you're uncertain, prepare first. That's better than rushing in."],
      ["自分にできることからやれ。他人の期待に全部応える必要はない。", "自信がないなら、まず支度をしろ。焦って飛び出すよりいい。"]),
    values: lines(
      ["나는 지킬 수 있는 약속이 중요해. 듣기 좋은 말만 믿고 움직이지는 않지.", "서로 뭘 약속했는지 분명한 게 좋아. 나중에 말이 달라지는 건 싫거든."],
      ["I value promises that can actually be kept. Fine words alone don't persuade me.", "I like to know exactly what we've agreed to. I don't care for terms that change afterward."],
      ["守れる約束を大事にする。うまい言葉だけでは動かない。", "何を約束したのか、はっきりしている方がいい。後から話が変わるのは好かない。"]),
    travelAdvice: lines(
      ["낯선 길이라면 돌아올 방법도 생각해 둬. 모르는 걸 아는 척하고 나서지는 마.", "경로와 준비는 직접 확인해. 남의 말만 믿고 떠나지는 말고."],
      ["On an unfamiliar route, think about how you'll get back. Don't pretend to know what you haven't checked.", "Check the route and your preparations yourself. Don't set out on someone else's word alone."],
      ["知らない道なら、帰る方法も考えておけ。分からないことを、知ったふりして進むな。", "道筋と支度は自分でも確かめろ。他人の言葉だけを信じて出るなよ。"]),
    theftEthics: lines(
      ["남의 물건에 손대면 뒷일도 생각해야 해. 쉽게 끝날 거라고는 믿지 마.", "필요한 물건과 가져도 되는 물건은 달라. 그 뒤에 생길 문제까지 생각해 봐."],
      ["If you take someone else's property, think about what comes after. Don't assume it'll end there.", "What you need and what you're entitled to take are different things. Think about the trouble that could follow."],
      ["人の物に手を出すなら、その後のことも考えろ。それで終わるとは思うな。", "必要な物と、取っていい物は別だ。後でどんな問題になるかも考えてみろ。"]),
    mana: lines(
      ["마나는 마법이나 몸을 강화하는 데 쓰는 힘이야. 다루는 솜씨는 제대로 써 보는 경험으로 느는 거지.", "마나는 마법이나 몸을 강화할 때 쓰는 힘이야. 그냥 많이 소모하기보다 실제로 쓸모 있게 써 봐야 하지."],
      ["Mana is used for magic and strengthening the body. You get better by putting it to effective use.", "Mana powers magic and bodily strengthening. To handle it well, you need experience using it to real effect."],
      ["マナは魔法や体の強化に使う力だ。うまく扱うには、実際に役立てる経験が要る。", "マナは魔法や体の強化に使う力だ。うまく扱うには、実際に効果を出して使う経験が大事になる。"]),
  },
  neighbour: {
    apology: lines(
      ["응, 들었어. 무슨 일이었는데?", "말해 줘서 고마워. 사정부터 들어 볼게."],
      ["All right, I hear you. What happened?", "Thanks for saying that. Tell me what happened first."],
      ["うん、聞いたよ。何があったの？", "言ってくれてありがとう。まずは事情を聞かせて。"]),
    praise: lines(
      ["고마워. 괜히 기분 좋아지네.", "그런 말 들으니까 좀 쑥스럽다. 고마워."],
      ["Thank you. You've made me smile.", "That's a little embarrassing, but thank you."],
      ["ありがとう。なんだかうれしくなるね。", "そんなこと言われると、ちょっと照れるな。ありがとう。"]),
    greeting: lines(
      ["안녕. 반가워.", "안녕. 만나서 반가워."],
      ["Hi. Good to see you.", "Hello there. Nice to see you."],
      ["こんにちは。", "こんにちは。会えてうれしいよ。"]),
    farewell: lines(
      ["잘 가. 가는 길 조심해.", "다음에 또 이야기하자."],
      ["Bye. Take care on the way.", "Let's talk again sometime."],
      ["またね。気をつけて帰ってね。", "また今度、お話ししようね。"]),
    thanks: lines(
      ["뭘, 도움이 됐다니 다행이네.", "천만에. 고마워할 것 없어."],
      ["Oh, I'm glad it helped.", "You're welcome. Don't mention it."],
      ["役に立ったならよかったよ。", "どういたしまして。気にしないで。"]),
    wellbeing: lines(
      ["잘 지내. 너는 어때?", "그럭저럭 잘 지내고 있어. 안부 물어 줘서 고마워."],
      ["I'm doing well. How about you?", "I'm all right, thanks. Nice of you to ask."],
      ["元気だよ。あなたはどう？", "まあまあ元気にしているよ。聞いてくれてありがとう。"]),
    tired: lines(
      ["피곤하면 잠깐 쉬어. 꼭 버틸 필요는 없잖아.", "그럴 땐 쉬운 일도 버겁지. 조금 쉬고 다시 해 봐."],
      ["Take a break if you're tired. You don't have to keep pushing.", "Even simple things can feel hard when you're worn out. Rest a little before trying again."],
      ["疲れたなら、少し休もう。無理に頑張り続けなくてもいいよ。", "疲れていると、簡単なことでも大変だよね。少し休んでから、またやってみよう。"]),
    worried: lines(
      ["뭐가 제일 걱정돼? 말로 해 보면 조금 정리될 수도 있어.", "한꺼번에 다 해결하려고 하지 마. 지금 할 수 있는 것부터 생각해 보자."],
      ["What's worrying you most? Saying it out loud might help you sort it out.", "Don't try to fix everything at once. Start with what you can do now."],
      ["何が一番心配？口にしてみると、少し整理できるかもしれないよ。", "一度に全部どうにかしようとしなくていいよ。今できることから考えよう。"]),
    lonely: lines(
      ["그럴 땐 별것 아닌 이야기라도 하고 싶지. 편하게 말해 봐.", "꼭 용건이 있어야 이야기하는 건 아니잖아. 무슨 이야기든 괜찮아."],
      ["Sometimes you just want a bit of company. Tell me what's on your mind.", "You don't need a reason to have a chat. We can talk about anything."],
      ["そういう時は、何でもない話でもしたくなるよね。気楽に話して。", "用事がなくても、お話ししていいんだよ。どんな話でも大丈夫。"]),
    encouragement: lines(
      ["작은 것부터 해 봐. 처음부터 능숙할 필요는 없잖아.", "할 수 있는 만큼부터 시작해도 돼. 남들과 너무 비교하지 마."],
      ["Try starting small. You don't have to be good at it straight away.", "Begin with what you can manage. Try not to compare yourself with everyone else."],
      ["小さなことからやってみよう。最初からうまくなくてもいいんだよ。", "できるところから始めればいいよ。人と比べすぎないでね。"]),
    values: lines(
      ["나는 가까운 사람들을 잘 챙기는 게 중요하다고 생각해. 작은 배려도 고맙잖아.", "거창한 말보다 평소에 잘해 주는 게 좋아. 곁에 있다고 당연하게 여기지는 않으려고 해."],
      ["I think it's important to look after the people close to you. Small kindnesses matter.", "I value everyday kindness more than grand words. I try not to take the people around me for granted."],
      ["身近な人を大切にすることが大事だと思うよ。小さな気遣いもうれしいものね。", "大げさな言葉より、普段の優しさが好きだな。そばにいることを、当たり前だと思わないようにしているよ。"]),
    travelAdvice: lines(
      ["떠나기 전에 길과 먹거리를 살펴봐. 돌아올 힘도 남겨 두고.", "처음 가는 길에서는 너무 서두르지 마. 날씨랑 몸 상태도 살피고."],
      ["Check your route and food before leaving. Keep some strength for the way back.", "Take your time on an unfamiliar road. Keep an eye on the weather and how you're feeling."],
      ["出発前に、道と食べ物を確かめておいてね。帰る力も残しておこう。", "初めての道では急がないで。天気や体の調子も見ながら進んでね。"]),
    theftEthics: lines(
      ["말없이 가져가면 주인이 곤란하잖아. 먼저 물어보는 게 좋겠어.", "갖고 싶어도 남의 물건이면 허락을 받아야지. 다른 방법을 찾아보자."],
      ["Taking it without asking could leave the owner in trouble. I'd ask first.", "Even if you want it, you should ask the owner. There may be another way."],
      ["黙って持っていったら、持ち主が困るよね。まず聞いてみるのがいいと思うな。", "欲しくても、人の物なら許可をもらわないとね。ほかの方法を考えてみよう。"]),
    mana: lines(
      ["마나는 마법이나 몸을 강하게 하는 데 쓰는 힘이야. 실제로 잘 써 보는 게 중요하다고 해.", "마나는 마법을 쓰거나 몸을 강하게 하는 힘이야. 실제로 잘 쓰는 경험을 통해 다루는 솜씨도 느는 거래."],
      ["Mana is a force used for magic and strengthening the body. They say learning to use it well takes practice.", "Mana is used for magic and making the body stronger. They say your control improves by putting it to good use."],
      ["マナは魔法や体を強くするのに使う力だよ。実際にうまく使う経験が大切なんだって。", "マナは魔法を使ったり、体を強くしたりする力だよ。実際にうまく使う経験で、扱う力も育つんだって。"]),
  },
};

export const NPC_UNKNOWN_INFORMATION_TEXT: Record<PrewrittenTone, LocalizedLines> = {
  host: lines(
    ["그건 나도 잘 모르겠어. 아는 척하며 이야기하고 싶진 않아.", "그 이야기는 들어 본 적이 없네. 어디서 들었는지 알려 줄래?"],
    ["I'm not sure about that. I'd rather say so than pretend I know.", "I haven't heard of that. Where did you hear about it?"],
    ["それは私にもよく分からないな。知っているふりはしたくないから。", "その話は聞いたことがないね。どこで聞いたの？"]),
  trade: lines(
    ["그건 제가 아는 내용이 아니네요. 확인하지 않은 이야기를 사실처럼 말씀드릴 순 없어요.", "그 이야기는 처음 들어요. 어디서 들으셨는지 말씀해 주시겠어요?"],
    ["I'm not familiar with that. I wouldn't want to pass a guess off as fact.", "That's new to me. Could you tell me where you heard about it?"],
    ["それは存じ上げません。確かめていない話を、本当のことのようには言えませんから。", "初めて聞く話ですね。どちらでお聞きになりましたか。"]),
  forge: lines(
    ["그건 모르겠군. 짐작만으로 말할 일은 아니네.", "처음 듣는 이야기일세. 어디서 들었나?"],
    ["Can't say I know. No use giving you guesswork.", "First I've heard of it. Where did you hear that?"],
    ["それは分からんな。憶測だけで話すわけにもいかん。", "初めて聞く話だな。どこで聞いた？"]),
  scholar: lines(
    ["제가 아는 범위에는 없는 내용이에요. 근거 없이 설명을 붙이진 않을게요.", "그 이야기는 아직 접하지 못했어요. 출처를 알려 주시겠어요?"],
    ["That falls outside what I know. I wouldn't want to offer an explanation without evidence.", "I haven't come across that before. Could you tell me the source?"],
    ["私の知っている範囲にはない話です。根拠のない説明は控えますね。", "その話には、まだ触れたことがありません。出典を教えていただけますか。"]),
  priest: lines(
    ["그건 저도 알지 못해요. 모르는 일을 함부로 단정하진 않을게요.", "그 이야기는 들어 보지 못했어요. 어디에서 접하셨나요?"],
    ["I don't know about that either. I would not want to speak with certainty where I have none.", "I haven't heard that before. Where did you come across it?"],
    ["それは私にも分かりません。知らないことを、軽々しく決めつけたくはありませんから。", "その話は聞いたことがありません。どこでお知りになりましたか。"]),
  leader: lines(
    ["내가 확인한 내용은 아니네. 짐작으로 판단하지는 않겠어.", "그 이야기는 모르겠군. 어디서 들었는지부터 말해 주게."],
    ["I haven't verified that. I won't make a judgment on guesswork.", "I'm not familiar with that account. Tell me where you heard it first."],
    ["私には確認できていない話だ。推測だけで判断はしない。", "その話は知らないな。まず、どこで聞いたのか教えてくれ。"]),
  covert: lines(
    ["그건 몰라. 모르는 걸 안다고 하진 않아.", "처음 듣는데. 어디서 나온 이야기야?"],
    ["Don't know. I won't pretend otherwise.", "That's new to me. Where did that story come from?"],
    ["それは知らない。知らないことを、知っているとは言わないよ。", "初めて聞いたね。どこから出た話？"]),
  neighbour: lines(
    ["글쎄, 나도 잘 모르겠어. 괜히 틀린 이야기를 해 주긴 싫네.", "난 처음 듣는 이야기야. 어디서 들었어?"],
    ["I'm not sure either. I'd hate to give you the wrong idea.", "I haven't heard that one before. Where did you hear it?"],
    ["うーん、私にもよく分からない。間違ったことを教えたくないしね。", "初めて聞く話だな。どこで聞いたの？"]),
};
