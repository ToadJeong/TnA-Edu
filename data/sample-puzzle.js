// sample-puzzle.js
// 2026년 T&A사업부 협력사 교육 - 컴플라이언스 가로세로 낱말퀴즈
//
//   dir : "across"(가로) | "down"(세로),  row/col : 0부터, num : 표시 번호
//   hintEnabled : 참가자 '글자 힌트' 버튼 사용 여부(관리자 ON/OFF)
// 좌표는 서로 교차하지 않는 단어 묶음 사이에 항상 빈 칸이 생기도록 배치되어 있습니다.
// 관리자 페이지의 에디터에서 위치를 자유롭게 바꿀 수 있습니다.
export const DEFAULT_PUZZLE = {
  title: "2026년 T&A사업부 협력사 교육 - 컴플라이언스 가로세로 낱말퀴즈",
  hintEnabled: true,
  words: [
    // ── 가로(Across) ──────────────────────────────────────────────
    { answer: "공정거래", dir: "across", row: 6, col: 5, num: 1,
      clue: "거래 과정에서 부당한 조건 강요나 경쟁 제한 행위를 금지하고, 공정한 시장 질서를 유지하기 위한 원칙" },
    { answer: "보안", dir: "across", row: 8, col: 6, num: 2,
      clue: "회사의 중요 정보 및 시스템이 외부로 유출되거나 침해되지 않도록 보호하는 활동" },
    { answer: "협력사", dir: "across", row: 7, col: 10, num: 3,
      clue: "회사와 계약 또는 협업 관계에 있는 외부 파트너 조직을 의미하는 용어" },
    { answer: "준법경영", dir: "across", row: 10, col: 0, num: 4,
      clue: "법과 규정을 준수하며 투명하고 책임 있는 방식으로 기업을 운영하는 경영 원칙" },
    { answer: "컴플라이언스", dir: "across", row: 1, col: 0, num: 5,
      clue: "법규 및 사내 규정 준수를 통해 부정행위와 리스크를 예방하는 관리 체계" },
    { answer: "직장내괴롭힘", dir: "across", row: 1, col: 7, num: 6,
      clue: "직장 내에서 발생할 수 있는 폭언·따돌림·부당한 업무 지시 등 구성원에게 정신적·신체적 피해를 주는 행위" },
    { answer: "계약서", dir: "across", row: 4, col: 3, num: 7,
      clue: "거래 조건과 권리·의무를 명확히 하기 위해 작성하는 문서" },

    // ── 세로(Down) ────────────────────────────────────────────────
    { answer: "청탁금지법", dir: "down", row: 6, col: 1, num: 1,
      clue: "금품·향응 제공 및 부정청탁을 금지하여 공정한 거래 문화를 유지하기 위한 법률" },
    { answer: "정보보호", dir: "down", row: 6, col: 6, num: 2,
      clue: "개인정보 및 회사 기밀 등 중요 정보를 안전하게 관리하고 유출을 방지하는 활동" },
    { answer: "감사", dir: "down", row: 6, col: 12, num: 3,
      clue: "업무 수행 과정에서 규정 준수 여부를 점검하고, 위반 사항을 확인하는 절차" },
    { answer: "정직", dir: "down", row: 0, col: 7, num: 4,
      clue: "투명하고 올바른 거래를 위해 거짓 없이 성실하게 행동하는 윤리적 가치" },
    { answer: "내부통제", dir: "down", row: 1, col: 9, num: 5,
      clue: "조직의 업무가 법규 및 내부 규정에 따라 적정하게 수행되도록 관리·점검하는 체계" },
    { answer: "이해관계", dir: "down", row: 1, col: 3, num: 6,
      clue: "개인적 이익 또는 관계로 인해 업무 판단이 영향을 받을 수 있는 상황 또는 관계" },
    { answer: "리스크", dir: "down", row: 0, col: 5, num: 7,
      clue: "법 위반, 부정행위, 정보 유출 등 조직에 손실을 발생시킬 수 있는 잠재적 위험 요소" },
  ],
};
