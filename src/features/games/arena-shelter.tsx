import React from "react";

export function ArenaShelter({
  level,
  name,
  itemKeys = [],
}: {
  level: number;
  name: string;
  itemKeys?: readonly string[];
}) {
  const fortified = level >= 3;
  const stone = level >= 4;
  const stronghold = level >= 5;
  const citadel = level >= 6;
  const palace = level >= 7;
  const imperial = level >= 8;
  const celestial = level >= 9;
  const immortal = level >= 10;
  const items = new Set(itemKeys);

  return (
    <div className={`arena-shelter-scene level-${level}`} data-shelter-level={level}>
      <svg
        aria-label={`${name}, nível ${level}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        viewBox="0 0 720 360"
      >
        <defs>
          <linearGradient id="shelter-sky" x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0"
              stopColor={
                immortal ? "#17152f" : celestial ? "#202853" : citadel ? "#272650" : "#344266"
              }
            />
            <stop
              offset="1"
              stopColor={
                immortal ? "#7c3f61" : celestial ? "#655285" : citadel ? "#b06455" : "#d8865d"
              }
            />
          </linearGradient>
          <linearGradient id="shelter-ground" x1="0" x2="1">
            <stop offset="0" stopColor="#6f4938" />
            <stop offset="0.5" stopColor="#a36b42" />
            <stop offset="1" stopColor="#654035" />
          </linearGradient>
          <linearGradient id="shelter-wall" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={stronghold ? "#b7a17d" : "#8c6a4b"} />
            <stop offset="1" stopColor={stronghold ? "#695648" : "#563f35"} />
          </linearGradient>
          <filter id="shelter-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        <rect width="720" height="360" fill="url(#shelter-sky)" />
        {celestial && (
          <g className="arena-shelter-stars" fill="#e5edff">
            {[45, 103, 171, 252, 447, 520, 647, 690].map((x, index) => (
              <circle cx={x} cy={34 + (index % 3) * 27} key={x} r={index % 2 ? 2 : 3} />
            ))}
          </g>
        )}
        <circle
          cx="575"
          cy="72"
          r={citadel ? 30 : 39}
          fill={immortal ? "#f8e5b2" : celestial ? "#d8e4ff" : citadel ? "#f7d8a4" : "#ffd67b"}
        />
        <path d="M0 188 118 82l98 106 98-83 96 83 105-112 125 112Z" fill="#2c304b" opacity=".72" />
        <path d="M0 207 126 132l83 74 112-74 104 76 126-85 169 84Z" fill="#514353" opacity=".78" />
        <rect y="205" width="720" height="155" fill="url(#shelter-ground)" />
        <ellipse cx="360" cy="332" rx="286" ry="24" fill="#3c2c2b" opacity=".35" />

        {fortified && (
          <g className="arena-shelter-palisade" fill="#50382f" stroke="#2d2526" strokeWidth="5">
            {Array.from({ length: 8 }, (_, index) => (
              <path d={`M${32 + index * 35} 286v-72l12-17 12 17v72Z`} key={`left-${index}`} />
            ))}
            {Array.from({ length: 8 }, (_, index) => (
              <path d={`M${448 + index * 35} 286v-72l12-17 12 17v72Z`} key={`right-${index}`} />
            ))}
          </g>
        )}

        {level === 1 ? (
          <g className="arena-shelter-tent" stroke="#3b2930" strokeLinejoin="round" strokeWidth="6">
            <path d="m224 291 112-130 113 130Z" fill="#b6644f" />
            <path d="m336 161 4 130" />
            <path d="m336 180-54 111h108Z" fill="#733e43" />
            <path d="M214 296h245" stroke="#e5b16d" />
          </g>
        ) : (
          <g
            className="arena-shelter-lodge"
            stroke="#382b2b"
            strokeLinejoin="round"
            strokeWidth="6"
          >
            {stone && (
              <rect x="215" y="208" width="285" height="103" rx="3" fill="url(#shelter-wall)" />
            )}
            {!stone && <rect x="228" y="210" width="260" height="101" fill="#815238" />}
            <path d="m192 216 170-105 170 105Z" fill={stronghold ? "#5a3e43" : "#70413b"} />
            <path d="m362 111 0 105" stroke="#e1ad67" opacity=".7" />
            <rect x="325" y="244" width="73" height="67" rx="30" fill="#38272b" />
            <rect x="253" y="239" width="42" height="36" rx="4" fill="#ffd67b" />
            <rect x="429" y="239" width="42" height="36" rx="4" fill="#ffd67b" />
            <path d="M237 225h250M237 250h250M237 275h250" opacity={stone ? ".38" : ".18"} />
          </g>
        )}

        {stone && (
          <g className="arena-shelter-towers" stroke="#392d2d" strokeWidth="6">
            <path d="M139 309V184h82v125Z" fill="url(#shelter-wall)" />
            <path d="M126 187v-31h26v18h21v-18h25v18h24v-18h25v31Z" fill="#73604f" />
            <path d="M500 309V184h82v125Z" fill="url(#shelter-wall)" />
            <path d="M487 187v-31h26v18h21v-18h25v18h24v-18h25v31Z" fill="#73604f" />
            <rect x="169" y="222" width="22" height="41" rx="11" fill="#332a2d" />
            <rect x="530" y="222" width="22" height="41" rx="11" fill="#332a2d" />
          </g>
        )}

        {stronghold && (
          <g className="arena-shelter-walls" stroke="#382d2c" strokeWidth="6">
            <path d="M72 312v-68h104v68M548 312v-68h103v68" fill="url(#shelter-wall)" />
            <path d="M61 247h126M537 247h125" stroke="#d0ad76" opacity=".6" />
          </g>
        )}

        {citadel && (
          <g className="arena-shelter-banners">
            <path d="M149 151V56" stroke="#f0cf82" strokeWidth="6" />
            <path
              d="M151 62h58l-12 26 12 25h-58Z"
              fill="#a83f48"
              stroke="#efc876"
              strokeWidth="4"
            />
            <path d="M573 151V56" stroke="#f0cf82" strokeWidth="6" />
            <path d="M571 62h-58l12 26-12 25h58Z" fill="#a83f48" stroke="#efc876" strokeWidth="4" />
            <circle cx="361" cy="186" r="27" fill="#bd7044" stroke="#f3d48d" strokeWidth="6" />
            <path d="m361 168 6 13 15 2-11 10 3 15-13-7-14 7 3-15-11-10 15-2Z" fill="#ffe29b" />
          </g>
        )}

        {palace && (
          <g className="arena-shelter-palace" stroke="#382d3b" strokeWidth="5">
            <path d="M286 211V132h150v79Z" fill="#8d6b63" />
            <path d="M273 137 361 73l88 64Z" fill="#5f4055" />
            <path d="M321 129V94h80v35Z" fill="#b59472" />
            <path d="M337 94q24-50 48 0Z" fill="#d8b36f" />
            <circle cx="361" cy="151" r="17" fill="#f3cf7a" />
          </g>
        )}

        {imperial && (
          <g className="arena-shelter-imperial" stroke="#302a39" strokeWidth="5">
            <path d="M91 267V128h58v139Z M573 267V128h58v139Z" fill="#82776f" />
            <path d="m83 132 37-49 37 49Z M565 132l37-49 37 49Z" fill="#553c58" />
            <path d="M110 181h20v47h-20Z M592 181h20v47h-20Z" fill="#25283b" />
          </g>
        )}

        {celestial && (
          <g className="arena-shelter-celestial" fill="#81c8d4" stroke="#d7f6ed" strokeWidth="3">
            <path d="m120 84 13-34 13 34-13 19Z M588 84l13-34 13 34-13 19Z" />
            <path d="m350 73 11-42 11 42-11 22Z" />
          </g>
        )}

        {immortal && (
          <g className="arena-shelter-immortal">
            <circle
              cx="361"
              cy="105"
              r="58"
              fill="none"
              stroke="#f4c96f"
              strokeWidth="4"
              opacity=".72"
            />
            <circle
              cx="361"
              cy="105"
              r="68"
              fill="none"
              stroke="#dd75a3"
              strokeDasharray="7 12"
              strokeWidth="3"
            />
            <path d="M361 36v26M301 70l23 13M421 70l-23 13" stroke="#ffe7a8" strokeWidth="5" />
          </g>
        )}

        {items.has("FORTIFIED_GATE") && (
          <g className="arena-shelter-item" data-item-key="FORTIFIED_GATE">
            <path d="M307 316v-76h106v76" fill="#4c322c" stroke="#2e2427" strokeWidth="7" />
            <path
              d="M322 316v-62h76v62M360 254v62"
              fill="#77503b"
              stroke="#d39b5f"
              strokeWidth="4"
            />
          </g>
        )}
        {items.has("REINFORCED_CHEST") && (
          <g className="arena-shelter-item" data-item-key="REINFORCED_CHEST">
            <path d="M526 296h74v35h-74Z" fill="#6f452f" stroke="#2f2828" strokeWidth="5" />
            <path
              d="M526 297c0-22 74-22 74 0M563 287v44"
              fill="#8f603c"
              stroke="#d0a15f"
              strokeWidth="5"
            />
          </g>
        )}
        {items.has("IRON_BRAZIER") && (
          <g className="arena-shelter-item" data-item-key="IRON_BRAZIER">
            <path d="M620 320h48l-8-24h-32Z" fill="#342d31" stroke="#d0a15f" strokeWidth="4" />
            <path d="M644 298c-17-12-3-24 2-36 14 13 17 26-2 36Z" fill="#ffd16f" />
          </g>
        )}
        {items.has("TRAINING_DUMMY") && (
          <g
            className="arena-shelter-item"
            data-item-key="TRAINING_DUMMY"
            stroke="#3a2c2b"
            strokeWidth="6"
          >
            <circle cx="653" cy="210" r="18" fill="#b17b4d" />
            <path d="M653 228v68M620 248h66M633 325l20-29 20 29" fill="none" />
          </g>
        )}
        {items.has("HERB_GARDEN") && (
          <g className="arena-shelter-item" data-item-key="HERB_GARDEN">
            <path d="M152 306h104l-12 31h-82Z" fill="#5d3c2f" stroke="#30282a" strokeWidth="5" />
            {Array.from({ length: 6 }, (_, index) => (
              <path
                d={`M${172 + index * 13} 310q-12-22 0-34 13 13 0 34Z`}
                fill="#66834e"
                key={index}
              />
            ))}
          </g>
        )}
        {items.has("CHAMPION_BANNER") && (
          <g className="arena-shelter-item" data-item-key="CHAMPION_BANNER">
            <path d="M90 266V102" stroke="#f0cf82" strokeWidth="7" />
            <path d="M93 108h73l-15 29 15 29H93Z" fill="#a83f48" stroke="#efc876" strokeWidth="4" />
            <path d="m125 119 6 11 13 2-10 9 3 13-12-6-12 6 3-13-10-9 13-2Z" fill="#ffe29b" />
          </g>
        )}
        {items.has("TACTICAL_ARMORY") && (
          <g
            className="arena-shelter-item"
            data-item-key="TACTICAL_ARMORY"
            stroke="#30272b"
            strokeWidth="5"
          >
            <path d="M442 325v-64h77v64" fill="#694638" />
            <path d="m454 309 48-42M503 309l-48-42" />
            <path d="M447 282h67M459 260v65M498 260v65" stroke="#d1a45f" />
          </g>
        )}
        {items.has("FIELD_INFIRMARY") && (
          <g
            className="arena-shelter-item"
            data-item-key="FIELD_INFIRMARY"
            stroke="#382b30"
            strokeWidth="5"
          >
            <path d="m24 307 54-68 54 68Z" fill="#e5ddd0" />
            <path d="M78 257v33M61 273h34" stroke="#a7444b" strokeWidth="8" />
          </g>
        )}
        {items.has("SENTINEL_TOWER") && (
          <g
            className="arena-shelter-item"
            data-item-key="SENTINEL_TOWER"
            stroke="#2f2930"
            strokeWidth="5"
          >
            <path d="M643 303V177h54v126Z" fill="#777069" />
            <path d="m634 181 36-43 36 43Z" fill="#523a4d" />
            <circle cx="670" cy="220" r="11" fill="#f2cf76" />
          </g>
        )}
        {items.has("MARBLE_AQUEDUCT") && (
          <g
            className="arena-shelter-item"
            data-item-key="MARBLE_AQUEDUCT"
            fill="none"
            stroke="#d2c7b8"
            strokeWidth="9"
          >
            <path d="M18 325V276h188v49M38 325v-24q0-25 25-25t25 25v24M108 325v-24q0-25 25-25t25 25v24M178 325v-49" />
            <path d="M22 286h180" stroke="#78b4c0" strokeWidth="5" />
          </g>
        )}
        {items.has("WAR_LIBRARY") && (
          <g
            className="arena-shelter-item"
            data-item-key="WAR_LIBRARY"
            stroke="#33272b"
            strokeWidth="4"
          >
            <path d="M520 324v-76h85v76Z" fill="#644337" />
            {[264, 284, 304].map((y) => (
              <path d={`M529 ${y}h67`} key={y} />
            ))}
            <path d="M536 256v60M550 256v60M570 256v60M589 256v60" stroke="#d19b5b" />
          </g>
        )}
        {items.has("CHAMPION_STATUE") && (
          <g
            className="arena-shelter-item"
            data-item-key="CHAMPION_STATUE"
            fill="#ad7b48"
            stroke="#45302d"
            strokeWidth="4"
          >
            <path d="M317 329h87v-18h-87Z" />
            <circle cx="361" cy="238" r="17" />
            <path d="M344 255h34l12 55h-58Z" />
            <path
              d="m348 269-30 27M374 269l30 27M346 307l-10 22M376 307l10 22"
              fill="none"
              strokeWidth="8"
            />
          </g>
        )}
        {items.has("ETERNAL_FLAME") && (
          <g className="arena-shelter-item" data-item-key="ETERNAL_FLAME">
            <path d="M328 333h66l-9-25h-48Z" fill="#403047" stroke="#e1b65e" strokeWidth="5" />
            <path d="M361 310c-35-25-8-49 3-79 28 26 37 56-3 79Z" fill="#e85d77" />
            <path d="M362 303c-15-16 1-29 4-45 13 16 16 32-4 45Z" fill="#ffe588" />
          </g>
        )}

        <g className="arena-shelter-fire">
          <ellipse cx="102" cy="312" rx="35" ry="11" fill="#2d2528" opacity=".5" />
          <path d="m77 312 49-25M126 312l-49-25" stroke="#4a3028" strokeWidth="8" />
          <circle
            cx="102"
            cy="286"
            r="24"
            fill="#f3a44f"
            filter="url(#shelter-glow)"
            opacity=".55"
          />
          <path d="M102 305c-29-18-5-33 3-51 19 18 27 37-3 51Z" fill="#ffcc62" />
          <path d="M103 302c-12-11 0-19 2-29 9 11 11 21-2 29Z" fill="#fff0a5" />
        </g>
        <g className="arena-shelter-smoke" fill="none" stroke="#d8d5d6" strokeLinecap="round">
          <path d="M105 247c-20-24 19-28 1-52" strokeWidth="9" opacity=".28" />
          <path d="M107 237c13-18-12-25 4-39" strokeWidth="6" opacity=".2" />
        </g>
      </svg>
      <span>Nível {level}</span>
    </div>
  );
}
