// 낭송 조각 계획을 JSON으로 내보낸다(tools/voice/build_voice.py가 읽는다).
//   node tools/voice/plan.mjs [--only id,id] [--tempo 박수] [--tempos id=박수,id=박수]
// 노래 데이터(js/data/songs/index.js)에서 조각 목록(voiceClips)과 박자 칸(buildGrid·clipSchedule)을 그대로 가져온다.
// 그래서 조각 이름·글·배치 시각이 게임 엔진과 어긋나지 않는다.
// 박자 칸 하나의 길이(slotSec)는 60 / 빠르기다. 향가는 구 하나가 한 박이므로 구 조각의 칸도 같다.
// lines는 한 번에 읽힐 줄(시조·사설시조 장, 가사 행, 고려가요 줄, 향가 구)과 그 줄의 음보 조각이다.
// --tempos는 노래마다 빠르기를 잠시 바꿔 칸을 계산한다(미리 듣기·빠르기 쓰기 전 계산용).
import { songs } from '../../js/data/songs/index.js';
import { voiceClips, syllableCount } from '../../js/core/song-shape.js';
import { buildGrid, clipSchedule, tempoOf, SEGMENT_GAP_SEC } from '../../js/core/rhythm.js';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = (opt('--only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const tempoOverride = opt('--tempo') ? Number(opt('--tempo')) : undefined;
const perSong = new Map((opt('--tempos') ?? '').split(',').filter(Boolean).map((kv) => {
  const [id, t] = kv.split('=');
  return [id.trim(), Number(t)];
}));

const unknown = only.filter((id) => !songs.some((s) => s.id === id));
if (unknown.length) {
  process.stderr.write('모르는 노래 id: ' + unknown.join(', ') + '\n');
  process.exit(2);
}

const picked = only.length ? songs.filter((s) => only.includes(s.id)) : songs;
const out = picked.map((song) => {
  const forced = perSong.get(song.id) ?? tempoOverride;
  const tempo = tempoOf(song, forced ? { tempo: forced } : {});
  const grid = buildGrid(song, { tempo });
  const clips = voiceClips(song).map((c) => ({ ...c, syllables: syllableCount(c.text) }));
  const lines = new Map();
  for (const c of clips) {
    const key = `${c.unit}-${c.line ?? ''}`;
    if (!lines.has(key)) lines.set(key, { key, unit: c.unit, line: c.line, text: '', clips: [] });
    lines.get(key).clips.push(c.path);
  }
  // 줄 글은 음보를 빈칸으로 잇되, 낱말 안에서 나눈 음보(고려가요 joined)는 붙인다(joinFeet와 같다).
  // 그래서 음보를 낱말 안에서 다시 나눠도 읽힐 줄 글이 그대로라 낭송 캐시를 다시 쓴다.
  const isJoined = (c) => song.genre === 'goryeo' && !!song.units[c.unit]?.lines?.[c.line]?.feet?.[c.foot]?.joined;
  for (const l of lines.values()) {
    l.text = l.clips.map((p, i) => {
      const c = clips.find((x) => x.path === p);
      return (i > 0 && !isJoined(c) ? ' ' : '') + c.text;
    }).join('');
  }
  const schedule = clipSchedule(grid, grid.segments.map((s) => s.index), 0).map((c) => ({ path: c.path, when: c.when, segment: c.segment }));
  return {
    id: song.id,
    title: song.title,
    genre: song.genre,
    tempo,
    tempoFromSong: song.tempo ?? null,
    slotSec: grid.beatSec,
    gapSec: grid.gapSec,
    duration: grid.duration,
    clips,
    lines: [...lines.values()],
    schedule,
  };
});

process.stdout.write(JSON.stringify({ gapSec: SEGMENT_GAP_SEC, allSongIds: songs.map((s) => s.id), songs: out }));
