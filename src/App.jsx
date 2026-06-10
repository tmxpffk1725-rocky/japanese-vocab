import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "jp_vocab_words";
const DAILY_KEY = "jp_vocab_daily";
const COOLDOWN_DAYS = 4;
const DAILY_COUNT = 30;

const sampleWords = [
  { id: 1, japanese: "勉強", reading: "べんきょう", korean: "공부", example: "毎日勉強しています。", wrong: 0 },
  { id: 2, japanese: "食べる", reading: "たべる", korean: "먹다", example: "ご飯を食べる。", wrong: 0 },
  { id: 3, japanese: "ありがとう", reading: "", korean: "감사합니다", example: "ありがとうございます。", wrong: 0 },
  { id: 4, japanese: "コーヒー", reading: "", korean: "커피", example: "コーヒーを飲みます。", wrong: 0 },
  { id: 5, japanese: "かわいい", reading: "", korean: "귀엽다", example: "かわいい猫ですね。", wrong: 0 },
];

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

// 오늘의 30단어 선택 로직
// daily 구조: { date: "2026-06-10", wordIds: [1,2,...], usedDates: { wordId: "2026-06-08", ... } }
function getDailyWords(words, savedDaily) {
  const today = getTodayStr();

  // 오늘 이미 선택된 단어가 있으면 그대로 사용
  if (savedDaily && savedDaily.date === today && savedDaily.wordIds) {
    const todayWords = savedDaily.wordIds
      .map(id => words.find(w => w.id === id))
      .filter(Boolean);
    if (todayWords.length > 0) return todayWords;
  }

  // 쿨다운 계산: 최근 COOLDOWN_DAYS일 안에 나온 단어 제외
  const usedDates = savedDaily?.usedDates || {};
  const cooldownDate = new Date();
  cooldownDate.setDate(cooldownDate.getDate() - COOLDOWN_DAYS);
  const cooldownStr = cooldownDate.toISOString().slice(0, 10);

  const available = words.filter(w => {
    const lastUsed = usedDates[w.id];
    return !lastUsed || lastUsed <= cooldownStr;
  });

  // 사용 가능한 단어가 30개 미만이면 쿨다운 무시하고 전체에서 선택
  const pool = available.length >= DAILY_COUNT ? available : words;
  const selected = shuffle(pool).slice(0, Math.min(DAILY_COUNT, pool.length));

  return selected;
}

function RubyText({ japanese, reading, size = 32, color = "#2d1f14" }) {
  if (!reading) {
    return <span style={{ fontSize: size, fontWeight: 700, color, fontFamily: "'Noto Sans JP', sans-serif", letterSpacing: 2 }}>{japanese}</span>;
  }
  return (
    <ruby style={{ fontSize: size, fontWeight: 700, color, fontFamily: "'Noto Sans JP', sans-serif", letterSpacing: 2, rubyAlign: "center" }}>
      {japanese}
      <rt style={{ fontSize: size * 0.38, fontWeight: 400, color: color === "#2d1f14" ? "#7a6655" : color, letterSpacing: 0.5 }}>{reading}</rt>
    </ruby>
  );
}

export default function App() {
  const [words, setWords] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : sampleWords;
    } catch { return sampleWords; }
  });

  const [daily, setDaily] = useState(() => {
    try {
      const saved = localStorage.getItem(DAILY_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [tab, setTab] = useState("list");
  const [form, setForm] = useState({ japanese: "", reading: "", korean: "", example: "" });
  const [editId, setEditId] = useState(null);
  const [card, setCard] = useState(null);
  const [cardMode, setCardMode] = useState("japanese");
  const [dailyOnly, setDailyOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [choices, setChoices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(false);

  // 오늘의 단어 목록
  const [dailyWords, setDailyWords] = useState(() => {
    try {
      const savedDaily = localStorage.getItem(DAILY_KEY);
      const parsedDaily = savedDaily ? JSON.parse(savedDaily) : null;
      const savedWords = localStorage.getItem(STORAGE_KEY);
      const parsedWords = savedWords ? JSON.parse(savedWords) : sampleWords;
      return getDailyWords(parsedWords, parsedDaily);
    } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(words)); } catch {}
  }, [words]);

  // daily 상태 저장 및 오늘 단어 갱신
  useEffect(() => {
    const today = getTodayStr();
    const usedDates = daily?.usedDates || {};

    // 날짜가 바뀌었거나 처음이면 새로 선택
    if (!daily || daily.date !== today) {
      const newDailyWords = getDailyWords(words, daily);
      const newUsedDates = { ...usedDates };
      newDailyWords.forEach(w => { newUsedDates[w.id] = today; });
      const newDaily = { date: today, wordIds: newDailyWords.map(w => w.id), usedDates: newUsedDates };
      setDaily(newDaily);
      setDailyWords(newDailyWords);
      try { localStorage.setItem(DAILY_KEY, JSON.stringify(newDaily)); } catch {}
    }
  }, [words]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const filtered = words.filter(w => {
    return w.japanese.includes(search) || w.korean.includes(search) || (w.reading && w.reading.includes(search));
  });

  const makeChoices = useCallback((correctWord, showKorean) => {
    const pool = dailyOnly ? dailyWords : words;
    const others = pool.filter(w => w.id !== correctWord.id);
    const wrong3 = shuffle(others.length >= 3 ? others : words.filter(w => w.id !== correctWord.id)).slice(0, 3);
    const answer = showKorean ? correctWord.japanese : correctWord.korean;
    const wrongAnswers = wrong3.map(w => showKorean ? w.japanese : w.korean);
    return shuffle([answer, ...wrongAnswers]);
  }, [words, dailyWords, dailyOnly]);

  const drawCard = useCallback(() => {
    const pool = dailyOnly ? dailyWords : words;
    if (pool.length === 0) { setCard(null); return; }
    const random = pool[Math.floor(Math.random() * pool.length)];
    const showKorean = cardMode === "random" ? Math.random() > 0.5 : cardMode === "korean";
    setCard({ ...random, showKorean });
    setSelected(null);
    setAnswered(false);
    setChoices(makeChoices(random, showKorean));
  }, [words, dailyWords, cardMode, dailyOnly, makeChoices]);

  useEffect(() => {
    if (tab === "flash") drawCard();
  }, [tab]);

  const handleSubmit = () => {
    if (!form.japanese.trim() || !form.korean.trim()) { showToast("단어와 뜻을 입력해주세요!"); return; }
    if (editId !== null) {
      setWords(prev => prev.map(w => w.id === editId ? { ...w, ...form } : w));
      setEditId(null);
      showToast("수정됐어요 ✓");
    } else {
      setWords(prev => [...prev, { ...form, id: Date.now(), wrong: 0 }]);
      showToast("저장됐어요 ✓");
    }
    setForm({ japanese: "", reading: "", korean: "", example: "" });
  };

  const handleEdit = (w) => {
    setForm({ japanese: w.japanese, reading: w.reading || "", korean: w.korean, example: w.example || "" });
    setEditId(w.id);
    setTab("add");
  };

  const handleDelete = (id) => {
    setWords(prev => prev.filter(w => w.id !== id));
    showToast("삭제됐어요");
  };

  const handleExport = () => {
    const data = JSON.stringify(words, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `단어장_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("내보내기 완료 ✓");
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) { showToast("올바른 파일이 아니에요!"); return; }
        const merged = [...words];
        let added = 0;
        imported.forEach(w => {
          if (!merged.find(existing => existing.japanese === w.japanese)) {
            merged.push({ ...w, id: Date.now() + Math.random() });
            added++;
          }
        });
        setWords(merged);
        showToast(`${added}개 단어를 가져왔어요 ✓`);
      } catch { showToast("파일을 읽을 수 없어요!"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleChoice = (choice) => {
    if (answered) return;
    const correctAnswer = card.showKorean ? card.japanese : card.korean;
    const isCorrect = choice === correctAnswer;
    setSelected(choice);
    setAnswered(true);
  };

  const activePool = dailyOnly ? dailyWords : words;
  const noCard = !card || activePool.length === 0;

  return (
    <div style={styles.container}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&family=Gowun+Dodum&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f5f0eb; }
        .word-row:hover { background: #f0ebe5 !important; }
        .btn-hover:hover { opacity: 0.85; transform: translateY(-1px); }
        .tab-btn { transition: all 0.2s; }
        .choice-btn:hover:not([disabled]) { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        input:focus, select:focus, textarea:focus { outline: 2px solid #e8a87c; outline-offset: 1px; }
        ruby { display: inline-flex; flex-direction: column-reverse; align-items: center; vertical-align: bottom; }
        rt { display: block; text-align: center; line-height: 1.2; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #d4c5b5; border-radius: 2px; }
      `}</style>

      <div style={styles.header}>
        <div style={styles.headerInner}>
          <span style={styles.logo}>語彙帳</span>
          <span style={styles.logoSub}>나만의 일본어 단어장</span>
        </div>
        <div style={styles.stats}>
          <span style={styles.statBadge}>총 {words.length}개</span>
          <span style={{ ...styles.statBadge, background: "#3a5a3a", color: "#a8d4a8" }}>
            오늘 {dailyWords.length}개
          </span>
        </div>
      </div>

      <div style={styles.tabs}>
        {[["list", "📚 단어 목록"], ["add", editId ? "✏️ 수정" : "➕ 단어 추가"], ["flash", "🃏 플래시카드"]].map(([key, label]) => (
          <button key={key} className="tab-btn" onClick={() => { setTab(key); if (key !== "add") { setEditId(null); setForm({ japanese: "", reading: "", korean: "", example: "" }); } }}
            style={{ ...styles.tab, ...(tab === key ? styles.tabActive : {}) }}>
            {label}
          </button>
        ))}
      </div>

      <div style={styles.content}>

        {/* LIST */}
        {tab === "list" && (
          <div>
            <div style={styles.filterRow}>
              <input placeholder="🔍 검색..." value={search} onChange={e => setSearch(e.target.value)} style={styles.searchInput} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button onClick={handleExport}
                style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1.5px solid #9b7ce8", background: "#f8f3ff", color: "#9b7ce8", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Gowun Dodum', sans-serif" }}>
                📤 내보내기
              </button>
              <label style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1.5px solid #7cb8e8", background: "#f3f8ff", color: "#7cb8e8", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Gowun Dodum', sans-serif", textAlign: "center" }}>
                📥 가져오기
                <input type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />
              </label>
            </div>

            {/* 오늘의 단어 배너 */}
            <div style={{ background: "#edf7ed", border: "1.5px solid #a8d4a8", borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#4a7a4a", fontWeight: 700, marginBottom: 4 }}>📅 오늘의 단어 ({getTodayStr()})</div>
              <div style={{ fontSize: 13, color: "#4a7a4a" }}>
                {dailyWords.length}개 선택됨 · 같은 단어는 {COOLDOWN_DAYS}일 안에 다시 안 나와요
              </div>
            </div>

            {filtered.length === 0 ? (
              <div style={styles.empty}><div style={{ fontSize: 48, marginBottom: 12 }}>📭</div><div style={{ color: "#9e8878" }}>단어가 없어요!</div></div>
            ) : (
              <div style={styles.wordList}>
                {filtered.map(w => {
                  const isToday = dailyWords.some(d => d.id === w.id);
                  return (
                    <div key={w.id} className="word-row" style={{ ...styles.wordRow, borderLeft: isToday ? "3px solid #7cc87c" : "1px solid #ede5da" }}>
                      <div style={styles.wordLeft}>
                        <div>
                          <div style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                            <RubyText japanese={w.japanese} reading={w.reading} size={18} />
                            {isToday && <span style={{ fontSize: 10, background: "#edf7ed", color: "#4a7a4a", padding: "1px 6px", borderRadius: 8, fontWeight: 700 }}>오늘</span>}
                          </div>
                          <div style={styles.korean}>{w.korean}</div>
                          {w.example && <div style={styles.example}>{w.example}</div>}
                        </div>
                      </div>
                      <div style={styles.wordRight}>
                        <button onClick={() => handleEdit(w)} style={{ ...styles.iconBtn, color: "#7cb8e8" }}>✏️</button>
                        <button onClick={() => handleDelete(w.id)} style={{ ...styles.iconBtn, color: "#e87c7c" }}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ADD */}
        {tab === "add" && (
          <div style={styles.formCard}>
            <h2 style={styles.formTitle}>{editId ? "단어 수정" : "새 단어 추가"}</h2>
            <label style={styles.label}>일본어 * <span style={{ color: "#b09a88", fontWeight: 400 }}>(한자, 히라가나, 가타카나 모두 가능)</span></label>
            <input value={form.japanese} onChange={e => setForm(f => ({ ...f, japanese: e.target.value }))}
              placeholder="예: 勉強 / ありがとう / コーヒー" style={styles.input} />
            <label style={styles.label}>히라가나 읽기 <span style={{ color: "#b09a88", fontWeight: 400 }}>(한자인 경우 입력, 히라가나/가타카나는 생략 가능)</span></label>
            <input value={form.reading} onChange={e => setForm(f => ({ ...f, reading: e.target.value }))}
              placeholder="예: べんきょう" style={styles.input} />
            {form.japanese && (
              <div style={{ background: "#f8f3ff", borderRadius: 12, padding: "14px 16px", marginBottom: 16, textAlign: "center", border: "1.5px solid #d4c0f0" }}>
                <div style={{ fontSize: 11, color: "#9b7ce8", marginBottom: 8, fontWeight: 700 }}>미리보기</div>
                <RubyText japanese={form.japanese} reading={form.reading} size={28} />
              </div>
            )}
            <label style={styles.label}>한국어 뜻 *</label>
            <input value={form.korean} onChange={e => setForm(f => ({ ...f, korean: e.target.value }))}
              placeholder="예: 공부" style={styles.input} />
            <label style={styles.label}>예문 (선택)</label>
            <textarea value={form.example} onChange={e => setForm(f => ({ ...f, example: e.target.value }))}
              placeholder="예: 毎日勉強しています。" style={{ ...styles.input, height: 72, resize: "none", fontFamily: "'Noto Sans JP', sans-serif" }} />
            <button className="btn-hover" onClick={handleSubmit} style={styles.submitBtn}>{editId ? "수정 완료" : "저장하기"}</button>
            {editId && <button onClick={() => { setEditId(null); setForm({ japanese: "", reading: "", korean: "", example: "" }); }} style={{ ...styles.submitBtn, background: "#e0d5cc", color: "#6b5744", marginTop: 8 }}>취소</button>}
          </div>
        )}

        {/* FLASH */}
        {tab === "flash" && (
          <div>
            {/* 오늘의 단어 진행 상황 */}
            <div style={{ background: "#edf7ed", border: "1.5px solid #a8d4a8", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#4a7a4a", fontWeight: 700 }}>
                📅 오늘의 단어 {dailyWords.length}개
                <span style={{ fontWeight: 400, marginLeft: 6 }}>· {COOLDOWN_DAYS}일 쿨다운</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <select value={cardMode} onChange={e => setCardMode(e.target.value)} style={styles.select}>
                <option value="random">랜덤 방향</option>
                <option value="japanese">일본어 → 한국어</option>
                <option value="korean">한국어 → 일본어</option>
              </select>
              <button onClick={() => { setDailyOnly(p => !p); }}
                style={{ ...styles.select, cursor: "pointer", background: dailyOnly ? "#7cc87c" : "#fff", color: dailyOnly ? "#fff" : "#6b5744", border: `1.5px solid #7cc87c`, fontWeight: dailyOnly ? 700 : 400 }}>
                {dailyOnly ? "✓ 오늘 단어만" : "오늘 단어만"}
              </button>
            </div>

            {noCard ? (
              <div style={styles.empty}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <div style={{ color: "#9e8878" }}>단어를 먼저 추가해주세요!</div>
                <button onClick={drawCard} style={{ ...styles.submitBtn, marginTop: 20, maxWidth: 200 }}>다시 시작</button>
              </div>
            ) : (
              <div>
                <div style={{ ...styles.flashCard, marginBottom: 16 }}>
                  {card.showKorean ? (
                    <span style={{ fontSize: 38, fontWeight: 700, color: "#2d1f14", fontFamily: "'Gowun Dodum', sans-serif" }}>{card.korean}</span>
                  ) : (
                    <RubyText japanese={card.japanese} reading={card.reading} size={38} />
                  )}
                  <div style={{ marginTop: 10, color: "#b09a88", fontSize: 12 }}>
                    {card.showKorean ? "한국어 → 일본어" : "일본어 → 한국어"}
                  </div>
                </div>

                {activePool.length < 4 ? (
                  <div style={{ textAlign: "center", padding: 20, color: "#b09a88", fontSize: 14 }}>4지선다는 단어가 4개 이상 필요해요!</div>
                ) : (
                  <div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                      {choices.map((choice, i) => {
                        const correctAnswer = card.showKorean ? card.japanese : card.korean;
                        const isCorrect = choice === correctAnswer;
                        const isSelected = choice === selected;
                        let bg = "#fff", color = "#2d1f14", border = "1.5px solid #d4c5b5", icon = "";
                        if (answered) {
                          if (isCorrect) { bg = "#edfaed"; color = "#2a6e2a"; border = "2px solid #7cc87c"; icon = " ✓"; }
                          else if (isSelected) { bg = "#faeeed"; color = "#7a2d2d"; border = "2px solid #e87c7c"; icon = " ✗"; }
                          else { bg = "#f5f0eb"; color = "#b09a88"; border = "1.5px solid #e0d5cc"; }
                        }
                        const matchWord = words.find(w => w.japanese === choice);
                        return (
                          <button key={i} className="choice-btn" disabled={answered} onClick={() => handleChoice(choice)}
                            style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border, background: bg, color, fontSize: 16, textAlign: "left", fontWeight: 500, display: "flex", alignItems: "center", cursor: answered ? "default" : "pointer", transition: "all 0.2s", fontFamily: "'Noto Sans JP', 'Gowun Dodum', sans-serif" }}>
                            <span style={{ fontSize: 12, color: answered ? color : "#c4a882", marginRight: 12, minWidth: 20, fontFamily: "'Gowun Dodum', sans-serif", fontWeight: 700 }}>{i + 1}</span>
                            {card.showKorean && matchWord && matchWord.reading
                              ? <RubyText japanese={choice} reading={matchWord.reading} size={16} color={color} />
                              : <span>{choice}</span>
                            }
                            {icon}
                          </button>
                        );
                      })}
                    </div>
                    {answered && (
                      <div>
                        {card.example && (
                          <div style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", marginBottom: 12, border: "1px solid #ede5da" }}>
                            <div style={{ fontSize: 11, color: "#b09a88", marginBottom: 4 }}>예문</div>
                            <div style={{ fontSize: 13, color: "#6b5744", fontFamily: "'Noto Sans JP', sans-serif" }}>{card.example}</div>
                          </div>
                        )}
                        <button onClick={drawCard} style={{ ...styles.submitBtn, background: "#4a3728" }}>다음 문제 →</button>
                      </div>
                    )}
                    {!answered && <button onClick={drawCard} style={{ ...styles.submitBtn, background: "#e0d5cc", color: "#6b5744" }}>건너뛰기</button>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

const styles = {
  container: { fontFamily: "'Gowun Dodum', sans-serif", background: "#f5f0eb", minHeight: "100vh", maxWidth: 480, margin: "0 auto", paddingBottom: 40 },
  header: { background: "#2d1f14", padding: "20px 20px 16px", color: "#f5f0eb" },
  headerInner: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 },
  logo: { fontSize: 28, fontWeight: 700, fontFamily: "'Noto Sans JP', sans-serif", color: "#e8c89a" },
  logoSub: { fontSize: 13, color: "#a08878" },
  stats: { display: "flex", gap: 8, flexWrap: "wrap" },
  statBadge: { background: "#3d2d1e", color: "#c4a882", padding: "4px 10px", borderRadius: 20, fontSize: 12 },
  tabs: { display: "flex", background: "#3d2d1e" },
  tab: { flex: 1, padding: "12px 0", border: "none", background: "transparent", color: "#a08878", fontSize: 13, cursor: "pointer", fontFamily: "'Gowun Dodum', sans-serif" },
  tabActive: { background: "#f5f0eb", color: "#4a3728", fontWeight: 700 },
  content: { padding: 16 },
  filterRow: { marginBottom: 12 },
  searchInput: { width: "100%", padding: "10px 14px", border: "1.5px solid #d4c5b5", borderRadius: 10, background: "#fff", fontSize: 14, fontFamily: "'Gowun Dodum', sans-serif", marginBottom: 10, color: "#2d1f14" },
  wordList: { display: "flex", flexDirection: "column", gap: 8 },
  wordRow: { background: "#fff", borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", transition: "background 0.15s" },
  wordLeft: { display: "flex", gap: 10, alignItems: "flex-start" },
  korean: { fontSize: 13, color: "#7a6655", marginTop: 4 },
  example: { fontSize: 12, color: "#b09a88", marginTop: 4, fontFamily: "'Noto Sans JP', sans-serif" },
  wordRight: { display: "flex", alignItems: "center", gap: 4, flexShrink: 0 },
  wrongBadge: { background: "#ffe0e0", color: "#c05050", fontSize: 11, padding: "2px 7px", borderRadius: 10 },
  iconBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: "4px" },
  empty: { textAlign: "center", padding: "60px 20px", color: "#b09a88" },
  formCard: { background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #ede5da" },
  formTitle: { fontSize: 18, color: "#2d1f14", marginBottom: 20, fontWeight: 700 },
  label: { display: "block", fontSize: 12, color: "#8a7060", marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 },
  input: { width: "100%", padding: "11px 14px", border: "1.5px solid #d4c5b5", borderRadius: 10, fontSize: 15, fontFamily: "'Noto Sans JP', 'Gowun Dodum', sans-serif", background: "#faf7f4", color: "#2d1f14", marginBottom: 16 },
  submitBtn: { width: "100%", padding: "13px", background: "#e8a87c", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, cursor: "pointer", fontWeight: 700, fontFamily: "'Gowun Dodum', sans-serif", transition: "all 0.2s", display: "block" },
  select: { padding: "9px 12px", border: "1.5px solid #d4c5b5", borderRadius: 10, background: "#fff", fontSize: 13, fontFamily: "'Gowun Dodum', sans-serif", color: "#4a3728" },
  flashCard: { borderRadius: 20, border: "2px solid #d4c5b5", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 170, padding: 24, textAlign: "center" },
  toast: { position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)", background: "#2d1f14", color: "#e8c89a", padding: "10px 24px", borderRadius: 30, fontSize: 14, zIndex: 999, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" },
};
