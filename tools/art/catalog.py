# 그림 목록(T26). 그림마다 이름, 크기, 화풍 참조, 대상 설명을 둔다.
# 프롬프트는 영어(ASCII)로만 쓴다. 화풍 문단은 승인된 샘플(tools/art/prompts/style_*.txt)의 문구를 그대로 쓴다.
# build_prompts.py가 이 목록으로 tools/art/prompts/<묶음>/<id>.txt를 만들고,
# genqueue.py가 그 프롬프트로 gen.ps1을 불러 assets/raw/art/<묶음>/<id>.png를 만든다.

STYLE = (
    "Visual style: Korean traditional paper-craft diorama look. Flat cut-paper shapes layered like a Korean "
    "paper doll (jongi inhyeong), soft hanji paper fiber texture, thin brush-ink outlines, gentle shading only by "
    "paper layering. Palette strictly limited: warm hanji cream (#f3ead6), ink black and ink greys (#2b2b2b, "
    "#5a5650, #8d8a85), with small accents of dancheong teal green (#2f7d6d) and vermilion (#c4462f) and a touch "
    "of muted gold. Calm, cozy, quiet museum-library mood, not cartoonish, not anime, no gradients of neon color. "
    "Absolutely no text, letters, calligraphy, numbers, signatures or watermarks anywhere in the image."
)
CHROMA = (
    "Place the subject alone on a perfectly flat solid magenta (#FF00FF) background for chroma keying, with no "
    "shadow on the background and nothing else in the frame. Keep the whole subject inside the central 80 percent "
    "of the image."
)
NO_MAGENTA = "Do not use any magenta, pink-purple or fuchsia color inside the subject itself."

SPRITE_LEAD = "A full-body front-facing character sprite of "
SPRITE_TAIL = (
    " Standing pose, feet visible, arms slightly apart so the silhouette reads clearly. Same paper-doll cutout look "
    "as a character in a Korean paper puppet theater."
)

SILLA = (
    "Costume of Unified Silla era Korea (8th century): a hip-length wrap jacket closed with a cloth belt, wide "
    "trousers tied at the ankles or a long wrap robe, hair in a topknot under a simple soft cloth cap; no Joseon "
    "horsehair gat hat."
)
GORYEO_OFFICIAL = (
    "Costume of a Goryeo dynasty (14th century) scholar-official: a dark round-collared official robe (dallyeong) "
    "with a stiff belt, and a black bokdu hat with two long flat straight side wings sticking out horizontally."
)
JOSEON_SCHOLAR = (
    "Costume of a Joseon dynasty scholar (seonbi): a wide-sleeved overcoat (dopo) with a thin cord belt tied at the "
    "chest, and a black horsehair gat hat with a wide flat round brim and a tall crown, tied under the chin."
)

# ── 인물 ──────────────────────────────────────────────
# ref: 화풍 참조 샘플 이름(assets/raw/style/<ref>.png). reuse: 생성하지 않고 승인 샘플을 그대로 가공한다.
CHARACTERS = [
    dict(id='student-a', reuse='style_student'),
    dict(id='student-b', ref='style_singer', subject=(
        "a young apprentice librarian, a Korean high-school student of today who has stepped into an old royal "
        "Joseon library. A clearly different person from a typical boy or girl, androgynous and gender-neutral: "
        "jaw-length layered hair with the top half tied back in a tiny knot, round thin wire-rimmed glasses, "
        "calm gentle face, no makeup, slim build. Outfit: a long cream hanbok-style coat-jacket reaching mid-thigh "
        "with a wide ink-grey collar band and a teal green cord tie, worn over a plain charcoal turtleneck, "
        "straight loose ink-grey trousers, dark grey canvas shoes, a long cloth book bag hanging from one "
        "shoulder. Holding an open thin stitched book in one hand and a brush pen in the other, kind curious "
        "expression.")),
    dict(id='mentor', ref='style_singer', subject=(
        "an elderly head librarian of an old Korean royal library, the kind former master of the archive: an old "
        "person with grey hair in a neat topknot and a short grey beard, gentle wise eyes, wearing a long ink-grey "
        "scholar robe with cream lining and ink stains on the sleeves, a teal green cord belt, holding a thick "
        "stitched old book against the chest and a small brass key ring hanging at the belt. Slightly stooped, "
        "warm smile. Faint wisps of grey ink mist curl around the hem of the robe.")),
    dict(id='jom', ref='style_keepsake', size='1024x1024', subject=(
        "A small bookworm creature for a game, based on a silverfish insect: a teardrop-shaped flat body tapering "
        "toward the tail, made of overlapping silvery-grey paper scales, two long thin antennae at the front and "
        "three thin long bristle tails at the back, six short legs, two tiny round black eyes and a cheeky little "
        "grin, nibbling the corner of a scrap of old paper. Cute but mischievous, side view, seen slightly from "
        "above. Ink-grey and silver tones only."), no_sprite_frame=True),
    dict(id='jom-king', ref='style_keepsake', size='1024x1024', subject=(
        "A giant boss monster for a calm educational game: the King of Bookworms, a huge looming shape made of "
        "swirling grey and black ink mist, with dozens of small silverfish-like bookworms (teardrop silvery bodies, "
        "long antennae, three bristle tails) crawling in and out of the mist, two big glowing pale eyes in the "
        "middle, torn scraps of blank old paper caught in the swirl. Mysterious and a little scary but not gory, "
        "suitable for teenagers. Front view."), no_sprite_frame=True),
]

# 가객: 노래 데이터의 singer.name → 그림 id. 같은 사람(또는 같은 이름 모를 무리)은 한 그림을 함께 쓴다.
SINGER_IDS = {
    '서동': 'seodong', '처용': 'cheoyong', '충담사': 'chungdam', '월명사': 'wolmyeong', '이름 모를 노인': 'anon-elder',
    '득오': 'deugo', '광덕': 'gwangdeok', '이름 모를 고려 백성': 'anon-goryeo', '이름 모를 정읍 행상인의 아내': 'anon-jeongeup',
    '양사언': 'yang-saeon', '황진이': 'hwang-jini', '이방원': 'yi-bangwon', '정몽주': 'jeong-mongju', '송순': 'song-sun',
    '길재': 'gil-jae', '이조년': 'yi-joyeon', '우탁': 'u-tak', '김종서': 'kim-jongseo', '신흠': 'sin-heum',
    '정철': 'jeong-cheol', '허난설헌': 'heo-nanseolheon', '정극인': 'jeong-geugin', '박인로': 'bak-inro',
    '이름 모를 서민': 'anon-commoner', '이름 모를 가객': 'anon-gagaek',
}

SINGERS = [
    dict(id='wolmyeong', reuse='style_singer'),  # 승인 샘플(신라 승려와 피리)
    dict(id='seodong', subject=(
        "a cheerful young man of the Three Kingdoms period of Korea, a wandering yam seller: a short beige hemp "
        "jacket belted with a rope, loose trousers tied at the ankles, straw sandals, hair in a simple topknot "
        "wrapped with a cloth band, carrying a woven bamboo basket full of yams on his back, waving one hand. "
        + SILLA)),
    dict(id='cheoyong', subject=(
        "a Silla-era dancer singing under the moon: a dignified man with a full black beard and a calm smile, "
        "wearing a long flowing vermilion and ink-grey robe with wide sleeves, a black hat decorated with peony "
        "flowers, one arm raised in a slow dance gesture, the other sleeve trailing. " + SILLA)),
    dict(id='chungdam', subject=(
        "a Unified Silla Buddhist monk poet of middle age with a shaven head, wearing a patched grey monk robe "
        "and a muted vermilion kasaya over one shoulder, carrying a small cylindrical wooden tea-utensil basket "
        "on his back by a strap, holding a small celadon tea bowl in both hands, peaceful expression.")),
    dict(id='anon-elder', subject=(
        "an anonymous old man of the Silla kingdom, a humble cattle herder: white hair and long white beard, "
        "weathered kind face, faded beige hemp clothes with a rope belt, straw sandals, holding a rope that leads "
        "off-frame in one hand and a small bunch of pale pink azalea flowers held out in the other, offering them. "
        + SILLA)),
    dict(id='deugo', subject=(
        "a young Silla hwarang follower (nangdo), a loyal youth of about twenty: neat topknot with a cloth band, a "
        "teal green hip-length jacket with a cream collar and belt, wide cream trousers tied at the ankles, a "
        "simple bow case at the hip, standing with a wistful look as if remembering his respected leader. "
        + SILLA)),
    dict(id='gwangdeok', subject=(
        "a humble Silla Buddhist layman who weaves straw sandals for a living: middle-aged, shaven head, plain "
        "light grey robe tied with a straw rope, holding a half-woven straw sandal and a bundle of straw, eyes "
        "half-closed in quiet prayer toward the moon. " + SILLA)),
    dict(id='anon-goryeo', subject=(
        "an anonymous ordinary person of the Goryeo dynasty, a singing commoner representing the common people: "
        "a young adult in a faded indigo-grey hemp jacket with a cloth belt, loose trousers tied at the ankles, "
        "straw sandals, hair tied up and wrapped in a plain cloth headband, holding a small hourglass drum "
        "(janggu) on a strap at the waist with one hand on its head, mouth open singing. Goryeo-era commoner "
        "clothes, no Joseon gat hat.")),
    dict(id='anon-jeongeup', subject=(
        "an anonymous wife of a traveling peddler from ancient Jeongeup, waiting on a hill at night for her husband "
        "to return: a woman in a plain cream and grey long skirt with a short wrap jacket of ancient Korean (Baekje "
        "era) style, hair braided and tied low at the back with a cloth, a small paper lantern hanging from one "
        "hand, the other hand at her chest, looking up anxiously at the moon.")),
    dict(id='yang-saeon', subject=(
        "Yang Sa-eon, a Joseon scholar and calligrapher of the 16th century, middle-aged with a neat black beard, "
        "standing upright and resolute, holding a large writing brush, an ink-grey dopo with teal trim. "
        + JOSEON_SCHOLAR)),
    dict(id='hwang-jini', subject=(
        "Hwang Jini, a celebrated gisaeng poet and musician of 16th century Joseon: an elegant woman with hair in "
        "a large neat braided updo (gache) held by a long hairpin, wearing a short jade-teal jeogori with a "
        "vermilion ribbon (goreum) and a long full ink-grey and cream chima skirt reaching the floor, holding a "
        "folded fan, calm intelligent gaze.")),
    dict(id='yi-bangwon', subject=(
        "Yi Bang-won as a young nobleman at the end of the Goryeo dynasty around 1392, ambitious and confident, "
        "a short mustache, wearing a deep vermilion round-collared official robe with a stiff gold-trimmed belt "
        "and a black bokdu hat with two long flat straight side wings, holding a wine cup raised as if offering a "
        "toast with a song.")),
    dict(id='jeong-mongju', subject=(
        "Jeong Mong-ju, a loyal scholar-official of late Goryeo, middle-aged with a long black beard, upright "
        "steadfast stern expression, hands folded in front of the chest, wearing a dark ink-grey round-collared "
        "robe. " + GORYEO_OFFICIAL)),
    dict(id='song-sun', subject=(
        "Song Sun, an elderly Joseon scholar retired to the countryside in the 16th century: white beard, relaxed "
        "warm smile, a cream dopo, holding a closed folding fan and gesturing with an open hand as if inviting a "
        "guest into his small thatched hut. " + JOSEON_SCHOLAR)),
    dict(id='gil-jae', subject=(
        "Gil Jae, a late-Goryeo scholar who lived as a recluse, middle-aged with a thin beard and a wistful "
        "melancholy face, wearing a plain undyed cream scholar robe with a black cloth hood-cap (bokgeon) instead "
        "of an official hat, holding horse reins loosely in one hand.")),
    dict(id='yi-joyeon', subject=(
        "Yi Jo-nyeon, a Goryeo scholar-official of the 14th century, older man with a grey beard, gentle wakeful "
        "eyes on a spring night, holding a small sprig of white pear blossoms, wearing a dusky teal round-collared "
        "robe. " + GORYEO_OFFICIAL)),
    dict(id='u-tak', subject=(
        "U Tak, a very old Goryeo scholar of the 14th century with long white hair and a long white beard, humorous "
        "twinkle in his eyes, plain grey scholar robe and a soft black cloth cap, holding a thorny branch in one "
        "hand and a knotted wooden walking stick in the other.")),
    dict(id='kim-jongseo', subject=(
        "Kim Jong-seo, an early Joseon general guarding the cold northern frontier, strong and dignified, black "
        "beard, wearing Joseon studded armor (dujeonggap): a long padded coat of dark cloth with rows of small "
        "brass rivets, a round iron helmet with a tall spike and a cloth neck guard, standing with both hands "
        "resting on a long sheathed sword planted point-down, snowy wind blowing his coat.")),
    dict(id='sin-heum', subject=(
        "Sin Heum, a 17th century Joseon scholar-official, slender middle-aged man with a neat beard, thoughtful "
        "gentle face, a pale grey-blue dopo, holding a small potted wild orchid. " + JOSEON_SCHOLAR)),
    dict(id='jeong-cheol', subject=(
        "Jeong Cheol, a 16th century Joseon scholar-official and poet, a lively expressive man with a full beard, "
        "flushed cheeks, holding a small white porcelain wine cup in one hand and a rolled scroll in the other, "
        "a light teal dopo. " + JOSEON_SCHOLAR)),
    dict(id='heo-nanseolheon', subject=(
        "Heo Nanseolheon, a 16th century Joseon noblewoman poet of the inner quarters: a young woman with hair in "
        "a low bun at the nape held by a long silver hairpin (binyeo), a cream jeogori with a dark teal collar and "
        "a deep vermilion ribbon, a long ink-grey chima skirt to the floor, holding a writing brush and a folded "
        "sheet of paper, quiet sorrowful refined expression.")),
    dict(id='jeong-geugin', subject=(
        "Jeong Geug-in, an early Joseon scholar who retired to a hermit's life in the countryside, older man with a "
        "grey beard, joyful content face in spring, wearing a coarse light-brown kudzu-cloth headwrap (galgeon) "
        "instead of a gat hat, a plain cream robe, holding a bamboo walking stick, a sprig of spring blossoms "
        "tucked at his belt.")),
    dict(id='bak-inro', subject=(
        "Bak In-ro, a Joseon poet who served as a naval officer during the Imjin war and later lived in poverty, "
        "middle-aged with a rough beard and a stoic face, wearing a faded dark blue military officer coat "
        "(cheollik) a little patched and worn, a black felt military hat (jeollip) with a wide round brim, a "
        "short tassel and a feather, a sword hanging at the waist.")),
    dict(id='anon-commoner', subject=(
        "an anonymous common person of the late Joseon dynasty, a farmer-peddler representing ordinary people: a "
        "sun-tanned adult in a short undyed hemp jacket and baggy trousers rolled up, a cloth headband, straw "
        "sandals, a jige A-frame back carrier on the back, holding a short tobacco pipe, cheerful grin.")),
    dict(id='anon-gagaek', subject=(
        "an anonymous professional singer (gagaek) of the late Joseon dynasty, a middle-class man known for "
        "witty songs: neat short beard, a light grey dopo with a teal cord belt, a black horsehair gat hat, holding "
        "an open folding fan up while singing, playful lively expression, one foot stepping forward.")),
]

# ── 기념품(노래 id → 물건) ─────────────────────────────
KEEP_LEAD = "A single object illustration drawn as a small keepsake card item, three-quarter view, slightly tilted, cut-paper style with ink outline: "

KEEPSAKES = [
    dict(id='seodongyo', subject=(
        "a tiny cutaway paper-craft model of a modest ancient Korean bedroom at night: a low room with an earthen "
        "floor, a sleeping mat and a folded blanket on the floor, a wooden lattice door slid half open, a small "
        "thatched roof edge above, a crescent moon cut from gold paper hanging beside it. No people.")),
    dict(id='cheoyongga', subject=(
        "a traditional Korean sleeping place on the floor: a thin cotton mattress (yo) laid flat with a folded "
        "quilt (ibul) neatly turned back and a long rectangular wooden pillow with embroidered ends, moonlight "
        "falling on it through a small lattice window frame standing behind. No people.")),
    dict(id='chan-giparangga', subject=(
        "a single branch of Korean pine (Pinus koraiensis, jat-namu) reaching upward: long dark green needles "
        "grouped in bundles of exactly five, a brown woody twig, and one elongated pine cone with thick hooked "
        "woody scales and a few pine nuts showing. Botanically accurate.")),
    dict(id='jemangmaega', subject=(
        "a thin bare twig with two remaining autumn leaves, one leaf just detaching and falling below it, the "
        "leaves are simple oval leaves with serrated edges and visible veins, faded yellow and vermilion, a light "
        "gust suggested by a few curling ink wind lines.")),
    dict(id='heonhwaga', subject=(
        "a freshly picked bunch of royal azalea flowers (Rhododendron schlippenbachii) tied at the stems with a "
        "thin straw cord: pale pink five-petaled wide open flowers with tiny dark freckles on the upper petal and "
        "long curved stamens, a few fresh green obovate leaves in whorls of five at the twig ends.")),
    dict(id='mojukjirangga', subject=(
        "a thick clump of wild mugwort growing in a small earthen hollow: many upright stems with deeply lobed "
        "grey-green leaves with silvery undersides, dense and bushy, a little patch of soil and grass at the base.")),
    dict(id='anminga', subject=(
        "a small round paper-craft piece of land like a miniature diorama base: terraced rice paddies, a little "
        "river, a few thatched farmhouses, small pine trees and a gentle hill, all on one floating disc of earth "
        "with a layered soil edge. No people.")),
    dict(id='wonwangsaengga', subject=(
        "a full moon cut from pale gold paper sinking toward the west over layered ink-grey mountain ridges, "
        "leaving a faint arc of soft light like a path across the night sky, a few small clouds. Composed as a "
        "round emblem.")),
    dict(id='cheongsan-byeolgok', ref=None, subject=(  # 샘플의 틀린 해금 구조를 따라 하지 않도록 참조 없이

        "a haegeum, the Korean two-string vertical fiddle, standing upright, with its bow. Exact structure: a "
        "long thin straight bamboo neck rising vertically; at the bottom a small round cylindrical wooden "
        "resonator (sound box) about the width of a hand, its front face covered by a thin flat wooden board; "
        "two tuning pegs pass sideways through the upper neck, both pegs on the same side; exactly two thin "
        "silk strings run from the pegs down along the neck to the bottom of the resonator over a small bridge; "
        "a single cord loop ties the two strings to the neck at mid height; the top of the neck ends plainly with "
        "a gentle backward curve, no animal head and no carving. The bow is a thin bamboo stick with loose "
        "horsehair, and the bow hair passes BETWEEN the two strings (the hair goes through the gap between the "
        "strings), the bow stick crossing in front near the resonator. Organologically accurate.")),
    dict(id='seogyeong-byeolgok', subject=(
        "a small Korean wooden river ferry boat: flat-bottomed plank hull with a square blunt bow and a raised "
        "stern, no sail, a single long wooden sculling oar (no) mounted at the stern on a pivot, a coiled rope "
        "and a bamboo pole lying inside, floating on a few stylized ink-line ripples. No people.")),
    dict(id='gasiri', mind=True, subject=(
        "An abstract emblem for a feeling of parting and sorrow, not an object: a single long vermilion silk "
        "thread tied in a loose knot that is half undone, the two ends drifting apart in opposite directions on a "
        "soft circular ink-wash halo, with a few falling petals. Simple, symbolic, centered, elegant.")),
    dict(id='jeongseokga', subject=(
        "a traditional Korean square wooden grain measure (doe): a sturdy open box with straight sides slightly "
        "wider at the top, made of thick wooden planks with visible joints, filled heaping with roasted chestnuts; "
        "each chestnut is glossy dark brown with a flat pale base and a pointed tip, some shells split open from "
        "roasting showing the yellow nut, a few chestnuts spilled on a small patch of sand beside the measure.")),
    dict(id='dongdong', subject=(
        "a single glowing round paper lantern hung high from the end of a tall wooden pole, the lantern made of "
        "hanji paper over a thin bamboo frame with ribs, a vermilion top and bottom rim and a short red tassel, "
        "warm light shining out, on the second full moon night with a pale moon behind.")),
    dict(id='sangjeoga', subject=(
        "a traditional Korean wooden mortar and pestle for pounding grain (jeolgu and jeolgutgongi): the mortar is "
        "a thick round log hollowed into a deep bowl at the top, standing waist-high on the ground; the pestle is "
        "a long straight wooden pole, thicker and rounded at both ends with a narrower middle grip, standing "
        "inside the mortar; some grain inside and a few grains scattered around.")),
    dict(id='jeongeupsa', subject=(
        "a high bright full moon risen far above a dark hill path at night: a winding narrow dirt path over a "
        "hill with a lonely pine, the moon large and luminous high in the sky with a soft halo lighting the "
        "path. Composed as a round emblem.")),
    dict(id='samogok', subject=(
        "two traditional Korean farming hand tools lying crossed: a homi and a nat. The homi (Korean hand hoe, "
        "NOT a garden trowel): a short straight wooden handle about a hand and a half long; from its end a thin "
        "iron neck curves forward and then bends sharply downward and back so that the blade hangs below and "
        "faces back toward the handle like a small hoe; the blade is a flat pointed triangle like an arrowhead "
        "or a plow tip, its flat face roughly perpendicular to the handle. The nat (Korean sickle): a straight "
        "wooden handle with a long, only slightly curved thin iron blade fixed at the end at roughly a right angle "
        "to the handle, the cutting edge on the inner side. Plain dark iron and worn wood, accurate shapes.")),
    dict(id='taesan', subject=(
        "a single towering mountain under the open sky: a tall steep rocky peak with layered ridges, pine trees "
        "clinging to cliffs, a small winding path going up, a few clouds around the summit, the sky above. "
        "Composed as an emblem.")),
    dict(id='dongjitdal', subject=(
        "a folded Korean silk quilt (ibul) for a long winter night: a thick rectangular quilt folded in three "
        "layers, the cover silk is muted teal with a woven pattern of spring breeze swirls and small plum "
        "blossoms, one long edge has a white cotton collar band (ibul-git), a vermilion lining showing at the "
        "folds.")),
    dict(id='ireondeul', subject=(
        "tangled wild arrowroot (kudzu, chik) vines: several brown twisting woody vines winding around each other "
        "in a knot, with broad green leaves in groups of three leaflets, some curling tendrils, and a small "
        "cluster of purple-red pea-like flowers.")),
    dict(id='imomi-jukgo', subject=(
        "a single small piece of deep crimson cut paper in a simple soft heart-like flame shape, glowing quietly "
        "from within, resting on an open palm-shaped piece of cream paper, with a faint gold rim. Symbolic of one "
        "steadfast red heart. Simple and centered.")),
    dict(id='simnyeon-gyeongyeong', subject=(
        "a small Korean thatched-roof hut with exactly three bays (choga samgan): three equal sections side by "
        "side under one roof, each bay with a paper-covered lattice door, a thick rounded straw thatched roof "
        "tied with rope nets, earthen walls with wooden posts, a narrow wooden veranda in front, set on a low "
        "stone base. No people.")),
    dict(id='cheongsanri-byeokgyesu', subject=(
        "a bright full moon filling the sky above quiet empty green mountains, a clear blue stream winding down "
        "between them catching the moonlight, no people, serene. Composed as a round emblem.")),
    dict(id='obaengnyeon-doeupji', subject=(
        "a single Korean pony (a small sturdy horse) standing in side view, with correct anatomy: four legs, one "
        "head, short thick neck, a dark mane and long tail, wearing a simple traditional wooden saddle with a "
        "cloth saddle pad and a rope bridle, reins hanging. Brown-grey coat.")),
    dict(id='eojeo-nae-iriyeo', mind=True, subject=(
        "An abstract emblem for a lingering affection and longing, not an object: soft swirls of grey ink mist "
        "gathering inward from the edges toward the center, where they turn into a warm gentle golden glow, "
        "like a feeling one cannot let go. Simple, symbolic, centered, elegant.")),
    dict(id='ihwa-wolbaek', subject=(
        "a flowering pear branch under moonlight: clusters of pure white five-petaled pear blossoms with dark "
        "red-tipped stamens, a few fresh green leaves, on a dark brown twig, a pale full moon behind the branch.")),
    dict(id='hanson-makdae', subject=(
        "a single rough wooden walking stick made from a natural branch: straight, knobbly with knots, a slight "
        "crook at the top as a handle, bark partly peeled, the bottom worn. Standing upright, simple.")),
    dict(id='sakpung', subject=(
        "a Joseon long sword (hwando) drawn half out of its scabbard: a single-edged slightly curved steel blade, "
        "a small round flat guard, a grip wrapped in dark cord, the black lacquered wooden scabbard with brass "
        "fittings and two hanging rings with a cord. Accurate proportions.")),
    dict(id='sinheum-sijo', subject=(
        "a few dry brown and amber fallen leaves lying on a small patch of path beside a clump of wild orchid "
        "(Korean spring orchid) with long thin arching grass-like leaves, one leaf still drifting down.")),
    dict(id='myeonangjeongga', subject=(
        "a small traditional Korean wooden pavilion (jeongja): a raised wooden floor on short stone footings, four "
        "front pillars across three bays, low wooden railings around the floor, a grey tiled roof with gently "
        "upturned eave corners, faded dancheong colors under the eaves, open sides, a few stone steps, perched on "
        "a small rocky hill with a pine tree. No people.")),
    dict(id='gwandong-byeolgok', subject=(
        "a Joseon governor's ceremonial staff of authority (jeol) standing upright: a tall vermilion lacquered "
        "wooden pole; near its top a short crossbar from which hangs a long column of seven stacked tiers of "
        "red cloth fringe tassels, one tier below another; a small carved white jade ornament crowns the top of "
        "the pole. Accurate ceremonial object, no flag and no text.")),
    dict(id='gyuwonga', subject=(
        "a traditional Korean weaving shuttle (bukk) for a loom, lying on a length of half-woven hemp cloth: the "
        "shuttle is a smooth boat-shaped wooden piece pointed at both ends, with an open hollow in its middle "
        "holding a small bobbin of thread, and a single thread coming out of a small hole in the side of the "
        "shuttle. Accurate shape.")),
    dict(id='sangchungok', subject=(
        "a hermit's soft headwear made of coarse kudzu cloth (galgeon): a simple soft square-topped cloth hood cap "
        "of loosely woven light-brown fiber with visible weave, two short cloth ribbon tails at the back, lying "
        "softly folded beside a small earthenware jar of homemade rice wine, the cloth slightly damp at one "
        "corner.")),
    dict(id='samiingok', subject=(
        "Joseon women's cosmetics: a small round white porcelain lidded powder jar with a blue floral pattern, its "
        "lid set aside showing white face powder, a tiny shallow porcelain dish of red rouge (yeonji), and a "
        "small soft powder puff. Arranged together.")),
    dict(id='seonsangtan', subject=(
        "a long sword (jang-geom) in a black scabbard worn at the waist, shown with its waist belt: the sword fully "
        "sheathed, slightly curved, a round flat guard, cord-wrapped grip, the scabbard hanging diagonally from "
        "a dark cloth belt by two rings and cords, with a small vermilion tassel at the hilt.")),
    dict(id='songmiingok', subject=(
        "a simple morning meal of rice porridge: a white porcelain bowl of plain rice porridge with a flat brass "
        "spoon resting in it, on a small round wooden folding table (soban) with short curved legs.")),
    dict(id='nuhangsa', subject=(
        "a traditional Korean rice wine set: a round-bellied white porcelain wine bottle with a narrow neck and a "
        "small cloth stopper, beside a small earthenware jar of clear rice wine with a gourd ladle, and one "
        "small wine cup.")),
    dict(id='gapminga', subject=(
        "a worn-out Korean summer hemp jacket (jeoksam) laid flat: a short unlined jeogori with a straight crossed "
        "collar band and a white collar strip (dongjeong), two long ties, wide sleeves, the coarse hemp cloth so "
        "threadbare and torn that large parts are missing, only the collar band still intact. Accurate jeogori "
        "shape.")),
    dict(id='namodo-bahi', subject=(
        "a heavily loaded Joseon cargo ship on rough waves: a wide flat-bottomed wooden hull piled high with "
        "straw-bundled rice bales, a broken mast, a torn woven-mat sail, ropes flying, dark storm clouds and "
        "spray. No people.")),
    dict(id='daekdeul-dongnanji', subject=(
        "a small brown glazed earthenware crock (onggi jar) of salted crabs with its lid tilted open, two small "
        "river crabs climbing out over the rim; each crab has exactly two claws, eight walking legs, a rounded "
        "shell and two short eye stalks. Accurate crab anatomy.")),
    dict(id='chang-naegoja', subject=(
        "a big old hand-forged claw hammer (jangdori): a straight wooden handle, an iron head with a flat round "
        "striking face on one side and a curved split claw for pulling nails on the other side, beside a few "
        "square iron nails and a small iron door hinge.")),
    dict(id='nimi-oma', subject=(
        "a pair of traditional Korean cotton socks (beoseon), plain pure white cotton with no colored bands, no "
        "stripes and no patterns at all: each sock has a pointed toe that curves gently upward like the tip of a "
        "canoe, a single visible seam running from the toe tip along the top of the foot, a rounded heel without "
        "any separate heel patch, no separate toes, and a wide straight cut opening above the ankle. One sock "
        "lies flat in side view showing the upturned toe, the other is slightly folded.")),
    dict(id='gwitturami', subject=(
        "a traditional Korean window with a thin wooden lattice frame covered by translucent silk, moonlight "
        "glowing through it, and a small cricket sitting on the windowsill. The cricket has six legs, long thin "
        "antennae and folded wings. Accurate cricket anatomy.")),
    dict(id='nonbat-gara', subject=(
        "a short Korean tobacco pipe (gombangdae) about the length of a hand: a small brass bowl at one end, a "
        "short straight bamboo stem, and a brass mouthpiece at the other end, beside a small cloth tobacco "
        "pouch with a drawstring. Accurate proportions.")),
    dict(id='hansuma', subject=(
        "a Korean traditional brass padlock shaped like a dragon-turtle: a horizontal barrel lock whose body is "
        "the turtle shell, a dragon head at the front, four small legs, a U-shaped shackle on top, and a long "
        "flat brass key inserted into the end of the barrel. Accurate antique lock.")),
    dict(id='suneung-saseol', subject=(
        "a Korean shield kite (bangpae-yeon): a rectangular paper kite taller than wide (about 3 to 2), with a "
        "round hole cut out in the exact center; its thin bamboo frame shows a vertical center spar, a horizontal "
        "spar across the top edge, a horizontal spar across the middle, and two diagonal spars from corner to "
        "corner; a colored half circle at the top center, and bridle strings meeting in front leading to a "
        "flying string. Accurate kite structure, no writing on it.")),
]

# ── 관 재질 무늬(이음매 없는 바둑판 무늬) ─────────────
TEX_LEAD = "A seamless tileable square texture, flat orthographic view, evenly lit, edges tile seamlessly left-right and top-bottom: "
TEXTURES = [
    # 승인 샘플을 참조로 주면 모든 무늬가 샘플과 똑같이 나와서, 재질 무늬는 화풍 문단만으로 만든다(ref=None).
    dict(id='entrance', subject="the dark aged wooden planks of a great library gate: vertical planks with rows of round iron studs, a single faded dancheong band of teal and vermilion cloud scrolls crossing horizontally, grey ink mist stains, hanji fiber visible."),
    dict(id='corridor', subject="a quiet corridor wall: plain cream hanji paper panels framed by thin dark wooden lattice strips in a simple square grid, a little ink-grey weathering, very calm and plain, almost no color."),
    dict(id='hyangga', subject="the weathered plaster wall of an ancient Silla tower: soft teal-grey plaster with scattered eight-petal lotus rosettes in faded vermilion and muted gold, small flame-like Buddhist cloud scrolls between them, cracks and grey ink mist stains."),
    dict(id='goryeo', subject="a Goryeo-style repeating diaper pattern: identical small round celadon-green medallions with a cloud and crane motif inlaid in cream and grey, arranged in a strict even grid on a pale grey-green ground, like Goryeo inlaid celadon, faded by grey ink mist."),
    dict(id='sijo', subject="a Joseon pavilion beam pattern made of exactly three stacked horizontal dancheong bands per tile, top band of small lotus buds, middle band of geometric diamonds, bottom band of plain teal, separated by thin cream lines, restrained colors faded by grey ink mist."),
    dict(id='gasa', subject="a rhythmic pattern of vertical dark wooden posts drawn in groups of four close together, then a wider strip of cream hanji wall, repeating evenly, with one thin faded dancheong band of flowing cloud scrolls running across the top, washed by grey ink mist."),
    dict(id='saseol', subject="a playful folk pattern: a long wavy dancheong band that stretches and bends like pulled taffy across the tile, with lively folk motifs of gourds, fish, peonies and coins in teal, vermilion and muted gold on a cream ground, faded by grey ink mist."),
    dict(id='hanji', subject="plain warm cream Korean hanji mulberry paper: soft visible long paper fibers, very subtle mottling, no pattern, no drawings, uniform light color."),
]

# ── 2D 그림 판(16:9) ───────────────────────────────────
BOARD_LEAD = "A wide 16:9 illustration for a 2D game background, "
BOARD_TAIL = " Keep the lower half of the picture as open walkable floor space without large objects in the foreground, no people, no characters. Calm and inviting, cozy lamp light."
BOARDS = [
    dict(id='entrance', subject="seen from the front: the entrance of an old Korean royal library at dusk, a large wooden double gate with faded dancheong under a tiled roof, stone steps leading up, a reading desk with a sealed envelope and a candle beside the gate, grey ink mist drifting across the stone courtyard, the colors mostly faded to ink grey."),
    dict(id='corridor', subject="a straight side view of one long wall of an old library corridor, flat like a theater backdrop: evenly spaced wooden pillars and plain cream hanji wall panels between them, a beam with a faded dancheong band along the top, wooden floorboards occupying the bottom quarter of the picture, soft grey ink mist along the floor. Absolutely no doors and no windows on the wall, the wall panels are plain.", tail=" No people, no characters, calm, cozy lamp light."),
    dict(id='hyangga', ref='style_texture', subject="seen from the front at a slight upward angle: inside an old library hall stands a slender tall wooden Silla-style tower, clearly a tower and not an open pavilion, with three stacked enclosed storeys and no outside staircase. The bottom storey shows a row of exactly 4 small arched niches, the middle storey a row of exactly 8 small arched niches, and the top storey reads from left to right: eight small arched niches, then one taller closed wooden door with a round ring handle, then two more small arched niches (ten niches in total on the top storey, the door standing just before the last two); each niche holds one rolled scroll. A pointed tiled roof with a finial on top, Silla Buddhist lotus motifs, scroll shelves at the hall walls, ink mist on the floor, most colors faded to ink grey."),
    dict(id='goryeo', subject="seen from a slightly elevated three-quarter angle: a row of identical small rooms with identical doors lined up side by side along one long hall, a corridor running in front of them connecting all the rooms, small hanging bells between the rooms, ink mist on the floor, Goryeo celadon accents, most colors faded to ink grey."),
    dict(id='sijo', subject="seen from a slightly elevated three-quarter angle like a paper-craft diorama on a table: a three-storey wooden pavilion (jeongja) standing inside the hall, each storey with two small landing platforms on its stairs, the stair up to the top storey has exactly three steps, bookshelves with scroll racks along the walls, soft grey ink mist drifting across the floor, colors faded to ink grey with hints of dancheong."),
    dict(id='gasa', subject="a straight side view, flat like a long scroll painting, of an endless roofed colonnade corridor stretching left and right beyond both edges of the picture and fading into ink mist at both ends. The red wooden pillars stand in clearly separated groups of exactly four: four pillars close together under one short tiled roof section, then a wide gap, then the next group of four pillars, then a wide gap, and so on; about three full groups of four are visible. A continuous wooden floor runs along the bottom, scroll racks in the gaps, colors faded to ink grey with faint dancheong."),
    dict(id='saseol', subject="seen from a slightly elevated three-quarter angle: a three-storey Korean pavilion whose middle storey is comically stretched very long sideways like pulled taffy, bending out of the library hall through an open side and spilling into a lively old Korean market street with stalls, baskets, earthenware jars and cloth awnings, ink mist in the hall, colors faded to ink grey with hints of dancheong."),
    dict(id='room-hyangga', subject="a quiet autumn scene: a single bare tree branch reaching across the picture in a strong wind, many leaves falling and swirling through the air, faint ink mist, a distant faint path leading toward a soft glowing western horizon, melancholic and calm."),
    dict(id='room-goryeo', subject="an open quiet space inside an old Korean hall for laying out cards: a wide empty polished wooden floor in the center surrounded by low wooden railings, a few earthenware jars and a hanging string of jade beads at the edges, soft light, Goryeo mood, plenty of empty space in the middle."),
    dict(id='room-sijo', subject="a small three-bay thatched hut (exactly three bays side by side) in the middle of a wide landscape, surrounded on all sides by layered mountains and winding rivers like a folding screen, under a pale moon, peaceful Joseon scholar retreat."),
    dict(id='room-gasa', subject="a spring journey seen from the side as a long scroll landscape from left to right: at the left a humble thatched hut, then a clear stream with blossoming trees, then a small pavilion on a rise, and at the far right a path climbing to a mountain peak, a continuous footpath connecting all four places, spring blossoms."),
    dict(id='room-saseol', subject="a moonlit night path running from the foreground through dark grass toward a small harvested field; at the end of the path, standing alone, is one tall thin bundle of dried, stripped hemp stalks (sam) tied together and propped upright, taller than a person, whose silhouette in the moonlight looks just like a tall thin person waiting; a few more hemp stalk bundles lean in the distance, low stone wall, humorous quiet suspense, full moon in the sky, no people, no buildings."),
    dict(id='boss', subject="the old Korean library at night swallowed by dark swirling ink fog: tall bookshelves fading into blackness, scattered pages, faint glowing scroll racks, small silverfish-like bookworms crawling on the spines of books, a heavy mass of black mist gathering in the center, mysterious but not gory.", tail=" Keep the lower half as open floor space, no people. Dark but readable, faint cool light."),
    dict(id='ending', subject="the same old Korean royal library fully restored and colorful: bright dancheong in teal green, vermilion and gold on every beam, a long open hall with a wide central aisle for a procession, lanterns lit, banners of plain colored cloth, scroll shelves full, warm festive morning light, the ink mist gone."),
]

# ── 카드 장식 ────────────────────────────────────────
CARDS = [
    dict(id='frame', size='1536x864', subject=(
        "A decorative rectangular border frame for a 16:9 result card: a thin double ink line frame with small "
        "faded dancheong corner ornaments (teal green and vermilion cloud motifs with a touch of muted gold) in "
        "the four corners and a subtle hanji paper edge, the whole inside of the frame is plain flat solid "
        "magenta (#FF00FF) so it can be cut out, and the outside margin around the frame is also flat solid "
        "magenta. The frame band is narrow, about 4 percent of the width. No text.")),
    dict(id='keepsake', size='1024x1536', subject=(
        "A decorative vertical card border frame for a collectible keepsake card: a portrait rectangle with "
        "rounded corners, a thin double ink line border, small faded dancheong cloud ornaments in the four "
        "corners (teal green, vermilion, muted gold), the whole inside of the frame is plain flat solid magenta "
        "(#FF00FF) so it can be cut out, and the outside margin around the frame is also flat solid magenta. The "
        "frame band is narrow, about 5 percent of the width. No text.")),
]
