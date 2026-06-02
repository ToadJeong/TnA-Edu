// sample-puzzle.js
// 기본(샘플) 문제. 관리자 페이지(admin.html)에서 언제든 수정/저장하면
// Firebase(또는 localStorage)에 저장된 내용이 우선 사용됩니다.
//
// answer: 정답(한글 단어). clue: 화면에 보여줄 힌트.
// 정답 단어들끼리 같은 "글자"가 있으면 자동으로 교차되어 십자말풀이가 됩니다.
export const DEFAULT_PUZZLE = {
  title: "T&A 가로세로 낱말퀴즈",
  words: [
    { answer: "교육", clue: "T&A사업부가 담당하는 핵심 활동 (○○)" },
    { answer: "육성", clue: "인재를 길러내는 일 (○○)" },
    { answer: "성장", clue: "꾸준히 발전하여 커지는 것 (○○)" },
    { answer: "인재", clue: "기업이 가장 원하는 ○○" },
    { answer: "재능", clue: "타고난 소질이나 끼 (○○)" },
    { answer: "능력", clue: "어떤 일을 해낼 수 있는 힘 (○○)" },
    { answer: "미디어", clue: "CJ ENM의 사업 영역, 매체 (○○○)" },
    { answer: "디지털", clue: "0과 1로 이루어진, 아날로그의 반대 (○○○)" },
    { answer: "콘텐츠", clue: "티빙·엠넷에서 즐기는 ○○○" },
    { answer: "방송", clue: "TV 프로그램을 송출하는 것 (○○)" },
  ],
};
