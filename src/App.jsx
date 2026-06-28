import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const STORAGE_KEY = "jp_vocab_words";
const DAILY_KEY_PREFIX = "jp_vocab_daily";
const getDailyKey = (level) => `${DAILY_KEY_PREFIX}_${level}`;
const COOLDOWN_DAYS = 4;
const DAILY_COUNT = 30;

const LEVELS = ["전체", "N5", "N4", "N3", "N2", "N1", "추가"];

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function getTodayStr() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
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
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);

  // 앱 시작 시: localStorage 있으면 그대로, 없으면 JSON 파일에서 로딩
  useEffect(() => {
    const init = async () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setWords(parsed);
            setLoading(false);
            return;
          }
        }
        // localStorage 비어있으면 번들 JSON 파일에서 로딩
        const res = await fetch(`${import.meta.env.BASE_URL}jlpt_all_fixed.json`);
        const data = await res.json();
        setWords(data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        console.error("단어 데이터 로딩 실패:", e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const [dailyWordsMap, setDailyWordsMap] = useState({});
  const [tab, setTab] = useState("list");
  const [card, setCard] = useState(null);
  const [cardMode, setCardMode] = useState("japanese");
  const [dailyOnly, setDailyOnly] = useState(true);
  const [activeSearch, setActiveSearch] = useState("");
  const [toast, setToast] = useState("");
  const [choices, setChoices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [sessionQueue, setSessionQueue] = useState([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ japanese: "", reading: "", korean: "" });
  const searchRef = useRef(null);

  useEffect(() => {
    if (loading || words.length === 0) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(words)); } catch {}
  }, [words, loading]);

  useEffect(() => {
    if (loading || words.length === 0) return;
    const today = getTodayStr();
    const newWordsMap = {};
    LEVELS.forEach(lv => {
      const pool = lv === "전체" ? words : words.filter(w => w.level === lv);
      if (pool.length === 0) return;
      const key = getDailyKey(lv);
      let saved = null;
      try { const s = localStorage.getItem(key); saved = s ? JSON.parse(s) : null; } catch {}
      if (saved && saved.date === today && saved.wordIds) {
        const todayWords = saved.wordIds.map(id => words.find(w => w.id === id)).filter(Boolean);
        if (todayWords.length > 0) { newWordsMap[lv] = todayWords; return; }
      }
      const usedDates = saved?.usedDates || {};
      const cooldownDate = new Date();
      cooldownDate.setDate(cooldownDate.getDate() - COOLDOWN_DAYS);
      const cooldownStr = cooldownDate.toISOString().slice(0, 10);
      const available = pool.filter(w => { const lu = usedDates[w.id]; return !lu || lu <= cooldownStr; });
      const sel = shuffle(available.length >= DAILY_COUNT ? available : pool).slice(0, Math.min(DAILY_COUNT, pool.length));
      const newUsedDates = { ...usedDates };
      sel.forEach(w => { newUsedDates[w.id] = today; });
      const newDaily = { date: today, wordIds: sel.map(w => w.id), usedDates: newUsedDates };
      newWordsMap[lv] = sel;
      try { localStorage.setItem(key, JSON.stringify(newDaily)); } catch {}
    });
    setDailyWordsMap(newWordsMap);
  }, [words, loading]);

  const speak = (word) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const text = word.reading || word.japanese;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ja-JP";
    utter.rate = 1.0;
    window.speechSynthesis.speak(utter);
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const handleSearch = () => {
    const q = searchRef.current?.value || "";
    setActiveSearch(q.trim());
  };

  const filtered = useMemo(() => {
    if (!activeSearch) return words;
    const q = activeSearch;
    const matched = words.filter(w => {
      const koreanMeanings = w.korean.split(/[,，、]/).map(s => s.trim());
      const koreanExact = koreanMeanings.includes(q);
      const jpMatch = w.japanese.includes(q) || (w.reading && w.reading.includes(q));
      return koreanExact || jpMatch;
    });
    return matched.sort((a, b) => {
      const aExact = a.japanese === q || a.korean.split(/[,，、]/).map(s => s.trim()).includes(q) || a.reading === q;
      const bExact = b.japanese === q || b.korean.split(/[,，、]/).map(s => s.trim()).includes(q) || b.reading === q;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return 0;
    });
  }, [words, activeSearch]);

  const getLevelPool = useCallback((level) => {
    if (level === "전체") return words;
    return words.filter(w => w.level === level);
  }, [words]);

  const getLevelDailyWords = useCallback((level) => {
    return dailyWordsMap[level] || [];
  }, [dailyWordsMap]);

  const makeChoices = useCallback((correctWord, showKorean, pool) => {
    const others = pool.filter(w => w.id !== correctWord.id);
    const fallback = words.filter(w => w.id !== correctWord.id);
    const wrong3 = shuffle(others.length >= 3 ? others : fallback).slice(0, 3);
    const answer = showKorean ? correctWord.japanese : correctWord.korean;
    const wrongAnswers = wrong3.map(w => showKorean ? w.japanese : w.korean);
    return shuffle([answer, ...wrongAnswers]);
  }, [words]);

  const startSession = useCallback((level) => {
    const basePool = dailyOnly ? getLevelDailyWords(level) : getLevelPool(level);
    if (basePool.length === 0) { setCard(null); return; }
    const queue = shuffle(basePool);
    setSessionQueue(queue);
    setCardIndex(0);
    setSessionDone(false);
    const first = queue[0];
    const showKorean = cardMode === "korean";
    setCard({ ...first, showKorean });
    setSelected(null);
    setAnswered(false);
    setChoices(makeChoices(first, showKorean, queue));
  }, [cardMode, dailyOnly, getLevelPool, getLevelDailyWords, makeChoices]);

  const drawCard = useCallback((queue, index) => {
    if (!queue || index >= queue.length) { setSessionDone(true); return; }
    const word = queue[index];
    const showKorean = cardMode === "korean";
    setCard({ ...word, showKorean });
    setSelected(null);
    setAnswered(false);
    setChoices(makeChoices(word, showKorean, queue));
  }, [cardMode, makeChoices]);

  const handleSelectLevel = (level) => {
    setSelectedLevel(level);
    setDailyOnly(true);
    startSession(level);
  };

  const handleDelete = (id) => {
    setWords(prev => prev.filter(w => w.id !== id));
    showToast("삭제됐어요");
  };

  const handleAddWord = () => {
    const japanese = form.japanese.trim();
    const reading = form.reading.trim();
    const korean = form.korean.trim();
    if (!japanese || !korean) { showToast("일본어와 뜻은 필수예요!"); return; }
    // 일본어(한자/가나)와 읽기(히라가나)가 둘 다 같을 때만 중복으로 판정
    const dup = words.some(w =>
      (w.japanese || "").trim() === japanese && (w.reading || "").trim() === reading
    );
    if (dup) { showToast("이미 있는 단어예요!"); return; }
    let id = Date.now();
    while (words.some(w => w.id === id)) id++;
    const newWord = { id, japanese, reading, korean, level: "추가", type: "vocab" };
    setWords(prev => [newWord, ...prev]);
    setForm({ japanese: "", reading: "", korean: "" });
    showToast("단어를 추가했어요 ✓");
  };

  // 추가한 단어를 모두 지우고 기본 단어로 되돌림 (번들 JSON 재로딩)
  const handleReset = async () => {
    if (!window.confirm("추가한 단어를 모두 지우고 기본 단어로 되돌릴까요?\n(되돌릴 수 없어요)")) return;
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}jlpt_all_fixed.json`);
      const data = await res.json();
      setWords(data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      showToast("기본 단어로 초기화했어요 ✓");
    } catch {
      showToast("초기화에 실패했어요!");
    }
  };

  const handleChoice = (choice) => {
    if (answered) return;
    setSelected(choice);
    setAnswered(true);
  };

  const activePool = selectedLevel
    ? (dailyOnly ? getLevelDailyWords(selectedLevel) : getLevelPool(selectedLevel))
    : [];
  const noCard = !card || activePool.length === 0;
  const total = sessionQueue.length;
  const current = cardIndex + 1;

  const levelCounts = useMemo(() => LEVELS.reduce((acc, lv) => {
    acc[lv] = lv === "전체" ? words.length : words.filter(w => w.level === lv).length;
    return acc;
  }, {}), [words]);

  const levelColors = {
    "전체": { bg: "#3d2d1e", color: "#e8c89a", border: "#5a4030" },
    "N5": { bg: "#edf7ed", color: "#2a6e2a", border: "#7cc87c" },
    "N4": { bg: "#e8f4ff", color: "#2a5a8e", border: "#7cb8e8" },
    "N3": { bg: "#fff8e8", color: "#8e6a2a", border: "#e8c87c" },
    "N2": { bg: "#f8e8ff", color: "#6a2a8e", border: "#c87ce8" },
    "N1": { bg: "#ffe8e8", color: "#8e2a2a", border: "#e87c7c" },
    "추가": { bg: "#fff3e8", color: "#a85f2a", border: "#e8a87c" },
  };

  const totalDailyCount = useMemo(() =>
    Object.values(dailyWordsMap).reduce((acc, arr) => acc + arr.length, 0),
  [dailyWordsMap]);

  // 로딩 화면
  if (loading) {
    return (
      <div style={{ fontFamily: "'Gowun Dodum', sans-serif", background: "#f5f0eb", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&family=Gowun+Dodum&display=swap');`}</style>
        <span style={{ fontSize: 36, fontFamily: "'Noto Sans JP', sans-serif", color: "#e8c89a", background: "#2d1f14", padding: "12px 24px", borderRadius: 16 }}>語彙帳</span>
        <span style={{ color: "#9e8878", fontSize: 14 }}>단어 불러오는 중...</span>
      </div>
    );
  }

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
        .level-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
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
          <span style={{ ...styles.statBadge, background: "#3a5a3a", color: "#a8d4a8", whiteSpace: "nowrap" }}>
            오늘 {totalDailyCount}개
          </span>
        </div>
      </div>

      <div style={styles.tabs}>
        {[["list", "📚 단어 목록"], ["flash", "🃏 플래시카드"]].map(([key, label]) => (
          <button key={key} className="tab-btn" onClick={() => { setTab(key); if (key === "flash") setSelectedLevel(null); }}
            style={{ ...styles.tab, ...(tab === key ? styles.tabActive : {}) }}>
            {label}
          </button>
        ))}
      </div>

      <div style={styles.content}>

        {tab === "list" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                ref={searchRef}
                placeholder="🔍 일본어 / 한국어 검색..."
                onKeyDown={e => { if (e.key === "Enter") handleSearch(); }}
                style={{ ...styles.searchInput, marginBottom: 0, flex: 1 }}
                enterKeyHint="search"
              />
              <button onClick={handleSearch}
                style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#e8a87c", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Gowun Dodum', sans-serif", whiteSpace: "nowrap" }}>
                검색
              </button>
            </div>

            <button onClick={() => setShowAddForm(p => !p)}
              style={{ width: "100%", padding: "10px 0", marginBottom: 12, borderRadius: 10, border: "1.5px solid #7cc87c", background: showAddForm ? "#7cc87c" : "#edf7ed", color: showAddForm ? "#fff" : "#4a7a4a", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Gowun Dodum', sans-serif" }}>
              {showAddForm ? "✕ 닫기" : "➕ 단어 추가"}
            </button>

            {showAddForm && (
              <div style={{ background: "#fff", border: "1.5px solid #d4c5b5", borderRadius: 12, padding: 14, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={form.japanese} onChange={e => setForm(f => ({ ...f, japanese: e.target.value }))}
                  placeholder="일본어 (한자/가나) *" style={styles.searchInput} />
                <input value={form.reading} onChange={e => setForm(f => ({ ...f, reading: e.target.value }))}
                  placeholder="읽기 (히라가나)" style={styles.searchInput} />
                <input value={form.korean} onChange={e => setForm(f => ({ ...f, korean: e.target.value }))}
                  placeholder="뜻 (한국어) *" style={styles.searchInput} />
                <button onClick={handleAddWord}
                  style={{ ...styles.submitBtn, background: "#7cc87c" }}>추가하기</button>
                <div style={{ fontSize: 12, color: "#b09a88", textAlign: "center" }}>
                  "추가" 레벨로 등록돼요 · 일본어·읽기가 둘 다 같은 단어가 있으면 추가되지 않아요
                </div>
                <div style={{ borderTop: "1px solid #ede5da", margin: "4px 0 0" }} />
                <button onClick={handleReset}
                  style={{ width: "100%", padding: "9px 0", borderRadius: 10, border: "1.5px solid #e8a8a8", background: "#fff", color: "#c46a6a", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Gowun Dodum', sans-serif" }}>
                  🔄 기본 단어로 초기화
                </button>
                <div style={{ fontSize: 12, color: "#c4a0a0", textAlign: "center" }}>
                  추가한 단어를 모두 지우고 기본 단어로 되돌려요
                </div>
              </div>
            )}

            {activeSearch && (
              <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#7a6655" }}>"{activeSearch}" 검색 결과 {filtered.length}개</span>
                <button onClick={() => { setActiveSearch(""); if (searchRef.current) searchRef.current.value = ""; }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#b09a88", fontSize: 12, padding: "2px 6px", borderRadius: 8, border: "1px solid #d4c5b5" }}>
                  ✕ 초기화
                </button>
              </div>
            )}

            <div style={{ background: "#edf7ed", border: "1.5px solid #a8d4a8", borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#4a7a4a", fontWeight: 700, marginBottom: 4 }}>📅 오늘의 단어 ({getTodayStr()})</div>
              <div style={{ fontSize: 13, color: "#4a7a4a" }}>
                급수별 각 {DAILY_COUNT}개 · 같은 단어는 {COOLDOWN_DAYS}일 안에 다시 안 나와요
              </div>
            </div>

            {filtered.length === 0 ? (
              <div style={styles.empty}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <div style={{ color: "#9e8878" }}>{activeSearch ? "검색 결과가 없어요!" : "단어가 없어요!"}</div>
              </div>
            ) : (
              <div style={styles.wordList}>
                {filtered.map(w => {
                  const isToday = Object.values(dailyWordsMap).some(arr => arr.some(d => d.id === w.id));
                  return (
                    <div key={w.id} className="word-row" style={{ ...styles.wordRow, borderLeft: isToday ? "3px solid #7cc87c" : "1px solid #ede5da" }}>
                      <div style={styles.wordLeft}>
                        <div>
                          <div style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                            <RubyText japanese={w.japanese} reading={w.reading} size={18} />
                            {isToday && <span style={{ fontSize: 10, background: "#edf7ed", color: "#4a7a4a", padding: "1px 6px", borderRadius: 8, fontWeight: 700 }}>오늘</span>}
                            {w.level && <span style={{ fontSize: 10, background: levelColors[w.level]?.bg || "#f5f0eb", color: levelColors[w.level]?.color || "#6b5744", padding: "1px 6px", borderRadius: 8, fontWeight: 700, border: `1px solid ${levelColors[w.level]?.border || "#d4c5b5"}` }}>{w.level}</span>}
                          </div>
                          <div style={styles.korean}>{w.korean}</div>
                          {w.example && <div style={styles.example}>{w.example}</div>}
                        </div>
                      </div>
                      <div style={styles.wordRight}>
                        <button onClick={() => speak(w)} style={{ ...styles.iconBtn, color: "#e8a87c" }}>🔊</button>
                        <button onClick={() => handleDelete(w.id)} style={{ ...styles.iconBtn, color: "#e87c7c" }}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "flash" && (
          <div>
            {!selectedLevel ? (
              <div>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#2d1f14", marginBottom: 6 }}>급수 선택</div>
                  <div style={{ fontSize: 13, color: "#9e8878" }}>공부할 단어 급수를 선택해주세요</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {LEVELS.filter(lv => levelCounts[lv] > 0).map(lv => {
                    const c = levelColors[lv];
                    const dailyCount = (dailyWordsMap[lv] || []).length;
                    return (
                      <button key={lv} className="level-btn" onClick={() => handleSelectLevel(lv)}
                        style={{ width: "100%", padding: "18px 20px", borderRadius: 16, border: `2px solid ${c.border}`, background: c.bg, color: c.color, fontSize: 18, fontWeight: 700, cursor: "pointer", fontFamily: "'Gowun Dodum', sans-serif", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all 0.2s" }}>
                        <span>{lv}</span>
                        <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.8 }}>
                          오늘 {dailyCount}개 / 전체 {levelCounts[lv]}개
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <button onClick={() => setSelectedLevel(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: "4px 8px", color: "#6b5744" }}>←</button>
                  {!sessionDone && card && (
                    <div style={{ flex: 1, background: "#edf7ed", border: "1.5px solid #a8d4a8", borderRadius: 12, padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 12, color: "#4a7a4a", fontWeight: 700 }}>{selectedLevel}</div>
                      <div style={{ fontSize: 16, color: "#4a7a4a", fontWeight: 700 }}>
                        <span style={{ fontSize: 22 }}>{current}</span>
                        <span style={{ fontSize: 13, fontWeight: 400 }}> / {total}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  <select value={cardMode} onChange={e => setCardMode(e.target.value)} style={styles.select}>
                    <option value="random">랜덤 방향</option>
                    <option value="japanese">일본어 → 한국어</option>
                    <option value="korean">한국어 → 일본어</option>
                  </select>
                  <button onClick={() => { setDailyOnly(p => !p); startSession(selectedLevel); }}
                    style={{ ...styles.select, cursor: "pointer", background: dailyOnly ? "#7cc87c" : "#fff", color: dailyOnly ? "#fff" : "#6b5744", border: `1.5px solid #7cc87c`, fontWeight: dailyOnly ? 700 : 400 }}>
                    {dailyOnly ? "✓ 오늘 단어만" : "오늘 단어만"}
                  </button>
                </div>

                {sessionDone ? (
                  <div style={styles.empty}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                    <div style={{ color: "#4a7a4a", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>완료!</div>
                    <div style={{ color: "#9e8878", fontSize: 14, marginBottom: 20 }}>{total}개를 모두 풀었어요</div>
                    <button onClick={() => startSession(selectedLevel)} style={{ ...styles.submitBtn, maxWidth: 200, marginBottom: 10 }}>다시 풀기</button>
                    <button onClick={() => setSelectedLevel(null)} style={{ ...styles.submitBtn, maxWidth: 200, background: "#e0d5cc", color: "#6b5744" }}>급수 변경</button>
                  </div>
                ) : noCard ? (
                  <div style={styles.empty}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                    <div style={{ color: "#9e8878", marginBottom: 16 }}>단어가 없어요!</div>
                    <button onClick={() => setSelectedLevel(null)} style={{ ...styles.submitBtn, maxWidth: 200, background: "#e0d5cc", color: "#6b5744" }}>급수 변경</button>
                  </div>
                ) : (
                  <div>
                    <div style={{ ...styles.flashCard, marginBottom: 16 }}>
                      {card.showKorean ? (
                        <span style={{ fontSize: 32, fontWeight: 700, color: "#2d1f14", fontFamily: "'Gowun Dodum', sans-serif" }}>{card.korean}</span>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                          <RubyText japanese={card.japanese} reading={card.reading} size={32} />
                          <button onClick={() => speak(card)}
                            style={{ background: "#fff8f0", border: "1.5px solid #e8c89a", borderRadius: 20, padding: "4px 14px", fontSize: 13, color: "#c4853a", cursor: "pointer", fontFamily: "'Gowun Dodum', sans-serif" }}>
                            🔊 듣기
                          </button>
                        </div>
                      )}
                      <div style={{ marginTop: 10, color: "#b09a88", fontSize: 12 }}>
                        {card.showKorean ? "한국어 → 일본어" : "일본어 → 한국어"}
                      </div>
                    </div>

                    {activePool.length < 4 ? (
                      <div style={{ textAlign: "center", padding: 20, color: "#b09a88", fontSize: 14 }}>4지선다는 단어가 4개 이상 필요해요!</div>
                    ) : (
                      <div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 10 }}>
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
                                style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border, background: bg, color, fontSize: 15, textAlign: "left", fontWeight: 500, display: "flex", alignItems: "center", cursor: answered ? "default" : "pointer", transition: "all 0.2s", fontFamily: "'Noto Sans JP', 'Gowun Dodum', sans-serif" }}>
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
                            {card.showKorean && (
                              <div style={{ textAlign: "center", marginBottom: 10 }}>
                                <button onClick={() => speak(card)}
                                  style={{ background: "#fff8f0", border: "1.5px solid #e8c89a", borderRadius: 20, padding: "5px 18px", fontSize: 13, color: "#c4853a", cursor: "pointer", fontFamily: "'Gowun Dodum', sans-serif" }}>
                                  🔊 정답 듣기
                                </button>
                              </div>
                            )}
                            {card.example && (
                              <div style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", marginBottom: 12, border: "1px solid #ede5da" }}>
                                <div style={{ fontSize: 11, color: "#b09a88", marginBottom: 4 }}>예문</div>
                                <div style={{ fontSize: 13, color: "#6b5744", fontFamily: "'Noto Sans JP', sans-serif" }}>{card.example}</div>
                              </div>
                            )}
                            <button onClick={() => { const next = cardIndex + 1; setCardIndex(next); drawCard(sessionQueue, next); }} style={{ ...styles.submitBtn, background: "#4a3728" }}>다음 문제 →</button>
                          </div>
                        )}
                        {!answered && <button onClick={() => { const next = cardIndex + 1; setCardIndex(next); drawCard(sessionQueue, next); }} style={{ ...styles.submitBtn, background: "#e0d5cc", color: "#6b5744" }}>건너뛰기</button>}
                      </div>
                    )}
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
  container: { fontFamily: "'Gowun Dodum', sans-serif", background: "#f5f0eb", minHeight: "100vh", paddingBottom: 40 },
  header: { background: "#2d1f14", padding: "20px 16px 16px", color: "#f5f0eb", minHeight: 100 },
  headerInner: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 },
  logo: { fontSize: 28, fontWeight: 700, fontFamily: "'Noto Sans JP', sans-serif", color: "#e8c89a" },
  logoSub: { fontSize: 13, color: "#a08878" },
  stats: { display: "flex", gap: 8, flexWrap: "nowrap" },
  statBadge: { background: "#3d2d1e", color: "#c4a882", padding: "4px 10px", borderRadius: 20, fontSize: 12, whiteSpace: "nowrap" },
  tabs: { display: "flex", background: "#3d2d1e" },
  tab: { flex: 1, padding: "12px 0", border: "none", background: "transparent", color: "#a08878", fontSize: 13, cursor: "pointer", fontFamily: "'Gowun Dodum', sans-serif", height: 44, whiteSpace: "nowrap" },
  tabActive: { background: "#f5f0eb", color: "#4a3728", fontWeight: 700 },
  content: { padding: 16 },
  searchInput: { width: "100%", padding: "10px 14px", border: "1.5px solid #d4c5b5", borderRadius: 10, background: "#fff", fontSize: 14, fontFamily: "'Gowun Dodum', sans-serif", color: "#2d1f14" },
  wordList: { display: "flex", flexDirection: "column", gap: 8 },
  wordRow: { background: "#fff", borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", transition: "background 0.15s" },
  wordLeft: { display: "flex", gap: 10, alignItems: "flex-start" },
  korean: { fontSize: 13, color: "#7a6655", marginTop: 4 },
  example: { fontSize: 12, color: "#b09a88", marginTop: 4, fontFamily: "'Noto Sans JP', sans-serif" },
  wordRight: { display: "flex", alignItems: "center", gap: 4, flexShrink: 0 },
  iconBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: "4px" },
  empty: { textAlign: "center", padding: "60px 20px", color: "#b09a88" },
  submitBtn: { width: "100%", padding: "11px", background: "#e8a87c", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, cursor: "pointer", fontWeight: 700, fontFamily: "'Gowun Dodum', sans-serif", transition: "all 0.2s", display: "block" },
  select: { padding: "9px 12px", border: "1.5px solid #d4c5b5", borderRadius: 10, background: "#fff", fontSize: 13, fontFamily: "'Gowun Dodum', sans-serif", color: "#4a3728" },
  flashCard: { borderRadius: 20, border: "2px solid #d4c5b5", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 130, padding: 16, textAlign: "center" },
  toast: { position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)", background: "#2d1f14", color: "#e8c89a", padding: "10px 24px", borderRadius: 30, fontSize: 14, zIndex: 999, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" },
};
