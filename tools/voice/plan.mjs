// 낭송 조각 계획을 JSON으로 내보낸다(tools/voice/build_voice.py가 읽는다).
//   node tools/voice/plan.mjs [--only id,id] [--tempo 박수]
// 노래 데이터(js/data/songs/index.js)에서 조각 목록(voiceClips)과 박자 칸(buildGrid·clipSchedule)을 그대로 가져온다.
// 그래서 조각 이름·글·배치 시각이 게임 엔진과 어긋나지 않는다.
// 박자 칸 하나의 길이(slotSec)는 60 / 빠르기다. 향가는 구 하나가 한 박이므로 구 조각의 칸도 같다.
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

const unknown = only.filter((id) => !songs.some((s) => s.id === id));
if (unknown.length) {
  process.stderr.write('모르는 노래 id: ' + unknown.join(', ') + '\n');
  process.exit(2);
}

const picked = only.length ? songs.filter((s) => only.includes(s.id)) : songs;
const out = picked.map((song) => {
  const tempo = tempoOf(song, tempoOverride ? { tempo: tempoOverride } : {});
  const grid = buildGrid(song, { tempo });
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
    clips: voiceClips(song).map((c) => ({ ...c, syllables: syllableCount(c.text) })),
    schedule,
  };
});

process.stdout.write(JSON.stringify({ gapSec: SEGMENT_GAP_SEC, allSongIds: songs.map((s) => s.id), songs: out }));
