import type { PrewrittenTopic } from '../shared/fantasy-dialogue-prewritten-text.ts';

export const GM_PREWRITTEN_TEXT: Record<PrewrittenTopic, Record<'ko' | 'en' | 'ja', readonly string[]>> = {
  greeting: {
    ko: ['안녕하세요. 궁금한 내용이나 하려는 일을 말씀해 주십시오.', '여행과 생활에 필요한 내용을 안내해 드립니다. 확인하고 싶은 내용을 말씀해 주십시오.'],
    en: ['Hello. Tell me what you would like to know or do.', 'Guidance is available on travel and daily life. Let me know what you would like to check.'],
    ja: ['こんにちは。知りたいことや、やりたいことをお伝えください。', '旅や暮らしに必要なことを案内します。確認したいことをお伝えください。'],
  },
  farewell: {
    ko: ['알겠습니다. 필요하면 다시 불러 주십시오.', '다음에 필요한 내용이 생기면 말씀해 주십시오.'],
    en: ['Goodbye. Return whenever you need guidance.', 'Let me know when you need further assistance.'],
    ja: ['では、また。必要になったらお声がけください。', 'ほかに確認したいことがあれば、またお声がけください。'],
  },
  thanks: {
    ko: ['네. 더 필요한 내용이 있으면 말씀해 주십시오.', '추가로 확인할 내용이 있으면 이어서 말씀해 주십시오.'],
    en: ['You are welcome. Let me know if you need anything else.', 'Let me know if there is anything else you would like to check.'],
    ja: ['どういたしまして。ほかに必要なことがあればお伝えください。', 'ほかに確認したいことがあれば、続けてお伝えください。'],
  },
  apology: {
    ko: ['알겠습니다. 이어서 하실 말씀을 들려주십시오.', '말씀은 확인했습니다. 어떤 일이 있었는지 설명해 주십시오.'],
    en: ['Understood. Please continue with what you would like to say.', 'Your apology is acknowledged. Please explain what happened.'],
    ja: ['分かりました。続けてお話しください。', 'お言葉は承りました。何があったのか説明してください。'],
  },
  praise: {
    ko: ['감사합니다. 추가로 확인할 내용이 있으면 말씀해 주십시오.', '감사합니다. 필요한 안내가 있으면 이어서 말씀해 주십시오.'],
    en: ['Thank you. Let me know if there is anything else to check.', 'Thank you. Please continue if you need further guidance.'],
    ja: ['ありがとうございます。ほかに確認したいことがあればお伝えください。', 'ありがとうございます。ほかに案内が必要でしたら、続けてお伝えください。'],
  },
  wellbeing: {
    ko: ['안내할 준비가 되어 있습니다. 필요한 내용을 말씀해 주십시오.', '필요한 안내를 드릴 수 있습니다. 궁금한 내용을 말씀해 주십시오.'],
    en: ['I am ready to provide guidance. Let me know what you need.', 'I can provide guidance. Let me know what you would like to ask.'],
    ja: ['案内の準備はできています。必要なことをお伝えください。', '案内できます。知りたいことをお伝えください。'],
  },
  tired: {
    ko: ['잠시 쉬어 가는 편이 좋습니다. 쉴 곳과 필요한 준비물을 확인하십시오.', '다음 활동을 정하기 전에 휴식 시간을 확보하십시오. 현재 피로도는 상태 정보에서 확인할 수 있습니다.'],
    en: ['Consider taking a break. Check where you can rest and what you will need.', 'Allow time to rest before choosing your next activity. Your current fatigue level is shown in your status.'],
    ja: ['いったん休むことをお勧めします。休める場所と必要な物を確認してください。', '次の活動を決める前に、休む時間を確保してください。現在の疲労度は状態表示で確認できます。'],
  },
  worried: {
    ko: ['걱정되는 일부터 차례로 정리해 보십시오. 알고 있는 사실과 아직 모르는 부분을 나누면 다음 행동을 정하기 쉽습니다.', '지금 확인할 수 있는 일부터 살펴보십시오. 모르는 부분을 추측으로 채울 필요는 없습니다.'],
    en: ['Start with the part that concerns you most. Separate what you know from what still needs checking before deciding what to do next.', 'Check what is within reach first. You can decide what to do next once the facts are clearer.'],
    ja: ['気がかりなことから順に整理してみてください。分かっていることと未確認のことを分けると、次の行動を考えやすくなります。', 'まずは今確かめられることから確認してください。不明な点を推測で埋める必要はありません。'],
  },
  lonely: {
    ko: ['말하고 싶은 내용을 자유롭게 말씀해 주십시오. 짧은 이야기부터 시작해도 됩니다.', '특별한 용건이 없어도 대화할 수 있습니다. 편한 주제부터 말씀해 주십시오.'],
    en: ['We can continue the conversation. Start with any subject you wish.', 'You do not need a specific request to talk. Choose a subject you are comfortable discussing.'],
    ja: ['話したいことを自由にお伝えください。短い話から始めてもかまいません。', '特別な用件がなくても、お話しできます。話しやすいことからお伝えください。'],
  },
  encouragement: {
    ko: ['지금 할 수 있는 작은 목표부터 시작하십시오. 한꺼번에 모든 일을 해결할 필요는 없습니다.', '가능한 일을 차례로 진행하십시오. 잘되지 않은 부분은 다음 계획을 세울 때 참고하면 됩니다.'],
    en: ['Start with a small goal you can work on now. You do not need to solve everything at once.', 'Take the available steps in order. Use what did not go well to inform your next plan.'],
    ja: ['今できる小さな目標から始めてください。一度にすべてを解決する必要はありません。', 'できることから順に進めてください。うまくいかなかった点は、次の計画を立てる時に生かせます。'],
  },
  values: {
    ko: ['확인된 사실과 일관된 판정 기준을 우선합니다. 같은 상황에는 같은 기준을 적용합니다.', '기록으로 확인되는 사실과 당사자의 선택을 기준으로 안내합니다. 말하지 않은 생각이나 의도를 대신 정하지 않습니다.'],
    en: ['Guidance is based on verified facts and consistent rulings. The same conditions are judged by the same standard.', 'Guidance respects the recorded facts and each person’s choices. Unstated thoughts or intentions are not assumed.'],
    ja: ['確認できた事実と一貫した判定基準を重視します。同じ条件には同じ基準を適用します。', '記録で確認できる事実と、当事者の選択に基づいて案内します。語られていない考えや意図を決めつけません。'],
  },
  travelAdvice: {
    ko: ['출발 전에 경로와 이동 수단, 필요한 준비물을 확인하십시오. 비용과 소요 시간도 함께 살펴보십시오.', '목적지까지 갈 방법과 돌아올 방법을 먼저 살펴보십시오. 먹거리와 휴식 준비도 챙기는 편이 좋습니다.'],
    en: ['Check the route, transport and supplies before setting out. Confirm the cost and travel time as well.', 'Plan how to reach the destination and how to return. Include food and rest in your preparations.'],
    ja: ['出発前に、経路と移動手段、必要な持ち物を確認してください。費用と所要時間も確かめておきましょう。', '目的地への行き方と帰り方を先に確かめてください。食べ物や休息の準備もしておくとよいでしょう。'],
  },
  theftEthics: {
    ko: ['소유자의 허락 없이 물건을 가져가는 것은 절도입니다. 발각되면 상황에 따라 추적이나 처벌을 받을 수 있습니다.', '주인의 허락을 받았는지 먼저 확인하십시오. 다른 사람의 물건을 몰래 가져가는 데에는 위험과 책임이 따릅니다.'],
    en: ['Taking someone else’s property without permission is theft. Discovery can lead to pursuit or penalties, depending on the situation.', 'Check whether you have the owner’s permission. Taking their belongings in secret carries risks and responsibility.'],
    ja: ['持ち主の許可なく他人の物を持ち去る行為は、盗みに当たります。見つかれば、状況によって追跡や処罰を受けるおそれがあります。', '持ち主の許可があるか、先に確認してください。人の物を黙って持ち去る行為には、危険と責任が伴います。'],
  },
  mana: {
    ko: ['마나는 마법과 신체 강화에 사용하는 힘입니다. 실제로 활용한 경험이 쌓이면 마나를 제어하는 능력도 성장합니다.', '마나는 마법뿐 아니라 몸을 강화하는 기술에도 쓰입니다. 힘을 쓰고 조절하는 경험을 통해 제어 능력이 발달합니다.'],
    en: ['Mana is a force used for magic and physical enhancement. Control improves through practical experience using it.', 'Mana also powers techniques that strengthen the body. Learning to use and regulate that power develops control.'],
    ja: ['マナは魔法や身体の強化に使う力です。実際に活用した経験を重ねると、制御する力も育ちます。', 'マナは魔法だけでなく、身体を強化する技にも使います。その力を使い、加減する経験を通じて制御が身につきます。'],
  },
};

export const GM_UNKNOWN_INFORMATION_TEXT: Record<'ko' | 'en' | 'ja', readonly string[]> = {
  ko: ['현재 확인할 수 있는 정보로는 답하기 어렵습니다. 추측으로 내용을 덧붙이지 않겠습니다.', '그 내용은 아직 확인되지 않았습니다. 확인된 사실만 안내해 드릴 수 있습니다.'],
  en: ['The available information does not support an answer. I will not fill the gap with a guess.', 'That information has not been verified. I can provide only what has been established.'],
  ja: ['今確認できる情報では、お答えできません。推測で内容を補うことはしません。', 'その内容は、まだ確認できていません。確認できた事実のみをご案内します。'],
};
