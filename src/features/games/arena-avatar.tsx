"use client";

import React, { useId } from "react";
import { ARENA_HAIR_COLORS, ARENA_SKIN_TONES, type ArenaAppearance } from "@/lib/games/arena";
import { arenaCatalogItem } from "@/lib/games/arena-economy";

function optionColor(options: ReadonlyArray<{ id: string; color: string }>, id: string) {
  return options.find((option) => option.id === id)?.color ?? "#777";
}

type EquipmentPalette = { primary: string; secondary: string; accent: string; dark: string };

const EQUIPMENT_PALETTES: Record<string, EquipmentPalette> = {
  STEEL: { primary: "#718296", secondary: "#aebdca", accent: "#f0b85b", dark: "#26313d" },
  LUNAR: { primary: "#8f9fc4", secondary: "#d9e5ff", accent: "#91d7e8", dark: "#293250" },
  LION: { primary: "#a96232", secondary: "#df9b42", accent: "#ffe08a", dark: "#4a2b25" },
  OBSIDIAN: { primary: "#382d44", secondary: "#744252", accent: "#ff665d", dark: "#17131d" },
  TEMPEST: { primary: "#397a91", secondary: "#65c7d2", accent: "#d8fbff", dark: "#18364b" },
  STORM: { primary: "#465e86", secondary: "#7796c8", accent: "#d6e6ff", dark: "#202b48" },
  EMERALD: { primary: "#28705a", secondary: "#54aa78", accent: "#d0f28e", dark: "#173b35" },
  SOLAR: { primary: "#b66c2e", secondary: "#e9a943", accent: "#fff0a6", dark: "#5b3027" },
  ECLIPSE: { primary: "#28243f", secondary: "#55456f", accent: "#d675c7", dark: "#12111d" },
  COLOSSUS: { primary: "#6d665e", secondary: "#a79578", accent: "#ead19a", dark: "#342f2c" },
  ASTRAL: { primary: "#4052a0", secondary: "#8b72c6", accent: "#8ee8ee", dark: "#202044" },
  ETERNAL: { primary: "#7b3362", secondary: "#d16479", accent: "#ffd978", dark: "#321c3e" },
};

function equipmentPalette(theme: string | undefined, fallback: EquipmentPalette) {
  return (theme && EQUIPMENT_PALETTES[theme]) || fallback;
}

function Hair({ appearance, color }: { appearance: ArenaAppearance; color: string }) {
  if (appearance.hairStyle === "SHAVED") return null;
  if (appearance.hairStyle === "MOHAWK")
    return (
      <path
        d="M103 105 C105 73 114 55 125 43 C136 55 145 73 147 105 C135 97 115 97 103 105Z"
        fill={color}
        stroke="#2a1d20"
        strokeWidth="3"
      />
    );
  if (appearance.hairStyle === "LONG")
    return (
      <path
        d="M92 118 C91 84 106 72 125 72 C146 72 160 88 158 122 L153 154 L142 142 L139 105 L109 105 L106 145 L95 154Z"
        fill={color}
        stroke="#2a1d20"
        strokeWidth="3"
      />
    );
  if (appearance.hairStyle === "BRAIDS")
    return (
      <g fill={color} stroke="#2a1d20" strokeWidth="3">
        <path d="M96 111 C95 82 109 72 125 72 C144 72 156 85 154 110 C139 99 111 99 96 111Z" />
        <path d="M101 105 C89 125 94 145 88 164 C101 157 108 139 107 109Z" />
        <path d="M149 105 C161 125 156 145 162 164 C149 157 142 139 143 109Z" />
      </g>
    );
  if (appearance.hairStyle === "CURLS")
    return (
      <g fill={color} stroke="#2a1d20" strokeWidth="2.5">
        {[99, 111, 124, 137, 149].map((x, index) => (
          <circle cx={x} cy={index % 2 ? 82 : 87} key={x} r="12" />
        ))}
      </g>
    );
  return (
    <path
      d="M96 109 C95 84 107 73 126 73 C144 73 156 86 154 108 C139 98 112 98 96 109Z"
      fill={color}
      stroke="#2a1d20"
      strokeWidth="3"
    />
  );
}

function Beard({ appearance, color }: { appearance: ArenaAppearance; color: string }) {
  if (appearance.beardStyle === "NONE") return null;
  if (appearance.beardStyle === "STUBBLE")
    return (
      <path
        d="M105 128 Q125 145 145 128 Q141 151 125 153 Q109 151 105 128Z"
        fill={color}
        opacity=".5"
      />
    );
  if (appearance.beardStyle === "GOATEE")
    return (
      <path
        d="M116 137 Q125 145 134 137 L131 164 L125 172 L119 164Z"
        fill={color}
        stroke="#2a1d20"
        strokeWidth="2"
      />
    );
  if (appearance.beardStyle === "BRAIDED")
    return (
      <g fill={color} stroke="#2a1d20" strokeWidth="2.5">
        <path d="M103 127 Q125 151 147 127 Q143 158 125 164 Q107 158 103 127Z" />
        <path d="M118 157 L125 184 L132 157 L134 178 L125 194 L116 178Z" />
      </g>
    );
  return (
    <path
      d="M101 124 Q125 153 149 124 Q148 158 125 174 Q102 158 101 124Z"
      fill={color}
      stroke="#2a1d20"
      strokeWidth="2.5"
    />
  );
}

function ArmourEquipment({
  itemKey,
  dataKey,
  theme,
}: {
  itemKey: string | undefined;
  dataKey?: string;
  theme?: string;
}) {
  const palette = equipmentPalette(
    theme,
    itemKey === "BRONZE_CUIRASS"
      ? { primary: "#a96233", secondary: "#cf8a42", accent: "#f0bd62", dark: "#5b3229" }
      : { primary: "#71452f", secondary: "#ad754b", accent: "#e0b365", dark: "#2a1d20" },
  );
  if (itemKey === "LEATHER_VEST")
    return (
      <g className="arena-equipment arena-equipment-armour" data-item-key={dataKey ?? itemKey}>
        <path
          d="M137 181 Q180 166 223 181 L216 260 Q180 274 144 260Z"
          fill={palette.primary}
          stroke={palette.dark}
          strokeWidth="4"
        />
        <path
          d="M153 179 L163 260 M207 179 L197 260"
          fill="none"
          stroke={palette.secondary}
          strokeWidth="4"
        />
        <path d="M171 187 L189 187 L186 252 L174 252Z" fill={palette.dark} opacity=".78" />
        {[198, 214, 230, 246].map((y) => (
          <path
            d={`M173 ${y} L187 ${y + 5} M187 ${y} L173 ${y + 5}`}
            key={y}
            stroke={palette.accent}
            strokeWidth="2.5"
          />
        ))}
      </g>
    );
  if (itemKey === "BRONZE_CUIRASS")
    return (
      <g className="arena-equipment arena-equipment-armour" data-item-key={dataKey ?? itemKey}>
        <path
          d="M132 181 Q180 160 228 181 L218 263 Q180 281 142 263Z"
          fill={palette.primary}
          stroke={palette.dark}
          strokeWidth="5"
        />
        <path
          d="M151 183 Q180 200 209 183 L204 246 Q180 260 156 246Z"
          fill={palette.secondary}
          stroke={palette.dark}
          strokeWidth="3"
        />
        <path
          d="M180 196 V250 M156 219 H204"
          fill="none"
          opacity=".75"
          stroke={palette.accent}
          strokeWidth="3"
        />
        <path
          d="M132 184 Q113 187 109 204 L130 218 L151 190Z"
          fill={palette.primary}
          stroke={palette.dark}
          strokeWidth="4"
        />
        <path
          d="M228 184 Q247 187 251 204 L230 218 L209 190Z"
          fill={palette.primary}
          stroke={palette.dark}
          strokeWidth="4"
        />
      </g>
    );
  return null;
}

function HelmetEquipment({
  itemKey,
  dataKey,
  theme,
}: {
  itemKey: string | undefined;
  dataKey?: string;
  theme?: string;
}) {
  const palette = equipmentPalette(
    theme,
    itemKey === "SCOUT_HELMET"
      ? { primary: "#9e6a3d", secondary: "#6e4636", accent: "#dbab59", dark: "#2a1d20" }
      : { primary: "#667181", secondary: "#505966", accent: "#aeb8c4", dark: "#20242d" },
  );
  if (itemKey === "SCOUT_HELMET")
    return (
      <g className="arena-equipment arena-equipment-helmet" data-item-key={dataKey ?? itemKey}>
        <path
          d="M128 111 Q130 61 180 55 Q230 61 232 111 L217 101 Q180 83 143 101Z"
          fill={palette.primary}
          stroke={palette.dark}
          strokeWidth="5"
        />
        <path d="M139 91 Q180 69 221 91" fill="none" stroke={palette.accent} strokeWidth="5" />
        <path
          d="M129 104 L143 100 L140 139 L129 148Z"
          fill={palette.secondary}
          stroke={palette.dark}
          strokeWidth="3"
        />
      </g>
    );
  if (itemKey === "IRON_HELMET")
    return (
      <g className="arena-equipment arena-equipment-helmet" data-item-key={dataKey ?? itemKey}>
        <path
          d="M126 112 Q126 57 180 50 Q234 57 234 112 L218 101 Q180 83 142 101Z"
          fill={palette.primary}
          stroke={palette.dark}
          strokeWidth="5"
        />
        <path d="M180 53 V102" fill="none" stroke={palette.accent} strokeWidth="5" />
        <path
          d="M126 105 L143 100 L140 147 L126 157Z M234 105 L217 100 L220 147 L234 157Z"
          fill={palette.secondary}
          stroke={palette.dark}
          strokeWidth="4"
        />
        <path
          d="M142 103 Q180 91 218 103 L211 116 Q180 108 149 116Z"
          fill={palette.dark}
          stroke={palette.dark}
          strokeWidth="3"
        />
      </g>
    );
  return null;
}

function ShieldEquipment({
  itemKey,
  dataKey,
  theme,
}: {
  itemKey: string | undefined;
  dataKey?: string;
  theme?: string;
}) {
  const palette = equipmentPalette(
    theme,
    itemKey === "OAK_BUCKLER"
      ? { primary: "#865631", secondary: "#5c3829", accent: "#d6a153", dark: "#2a1d20" }
      : { primary: "#596473", secondary: "#98a4b2", accent: "#d29a49", dark: "#20242d" },
  );
  if (itemKey === "OAK_BUCKLER")
    return (
      <g className="arena-equipment arena-equipment-shield" data-item-key={dataKey ?? itemKey}>
        <circle
          cx="105"
          cy="263"
          fill={palette.primary}
          r="35"
          stroke={palette.dark}
          strokeWidth="5"
        />
        <circle cx="105" cy="263" fill="none" r="27" stroke={palette.accent} strokeWidth="4" />
        <path d="M78 263 H132 M105 236 V290" stroke={palette.secondary} strokeWidth="4" />
        <circle
          cx="105"
          cy="263"
          fill={palette.accent}
          r="9"
          stroke={palette.dark}
          strokeWidth="3"
        />
      </g>
    );
  if (itemKey === "TOWER_SHIELD")
    return (
      <g className="arena-equipment arena-equipment-shield" data-item-key={dataKey ?? itemKey}>
        <path
          d="M76 211 Q105 195 134 211 L130 318 Q105 342 80 318Z"
          fill={palette.primary}
          stroke={palette.dark}
          strokeWidth="6"
        />
        <path
          d="M86 219 Q105 210 124 219 L121 308 Q105 323 89 308Z"
          fill={palette.dark}
          stroke={palette.secondary}
          strokeWidth="3"
        />
        <path d="M105 212 V322 M84 260 H126" stroke={palette.accent} strokeWidth="5" />
        <circle
          cx="105"
          cy="260"
          fill={palette.accent}
          r="10"
          stroke={palette.dark}
          strokeWidth="3"
        />
      </g>
    );
  return null;
}

function WeaponEquipment({
  itemKey,
  dataKey,
  theme,
}: {
  itemKey: string | undefined;
  dataKey?: string;
  theme?: string;
}) {
  const palette = equipmentPalette(
    theme,
    itemKey === "COPPER_SHORT_SWORD"
      ? { primary: "#d58a48", secondary: "#6e4636", accent: "#f0c46d", dark: "#2a1d20" }
      : itemKey === "DUELIST_SPEAR"
        ? { primary: "#b9c5d0", secondary: "#75482d", accent: "#e1b25a", dark: "#2a1d20" }
        : { primary: "#596473", secondary: "#6b442f", accent: "#d1a348", dark: "#20242d" },
  );
  if (itemKey === "COPPER_SHORT_SWORD")
    return (
      <g className="arena-equipment arena-equipment-weapon" data-item-key={dataKey ?? itemKey}>
        <path
          d="M249 277 L274 183 L285 169 L286 187 L260 281Z"
          fill={palette.primary}
          stroke={palette.dark}
          strokeWidth="4"
        />
        <path d="M253 269 L273 276" stroke={palette.accent} strokeWidth="7" />
        <path d="M256 277 L248 307" stroke={palette.secondary} strokeWidth="8" />
        <circle
          cx="246"
          cy="311"
          fill={palette.accent}
          r="6"
          stroke={palette.dark}
          strokeWidth="3"
        />
      </g>
    );
  if (itemKey === "DUELIST_SPEAR")
    return (
      <g className="arena-equipment arena-equipment-weapon" data-item-key={dataKey ?? itemKey}>
        <path d="M249 306 L277 102" stroke={palette.secondary} strokeWidth="8" />
        <path
          d="M277 104 L269 133 L281 126 L287 139 L287 96Z"
          fill={palette.primary}
          stroke={palette.dark}
          strokeWidth="4"
        />
        <path d="M258 242 L270 244" stroke={palette.accent} strokeWidth="5" />
      </g>
    );
  if (itemKey === "IRON_MAUL")
    return (
      <g className="arena-equipment arena-equipment-weapon" data-item-key={dataKey ?? itemKey}>
        <path d="M249 302 L272 190" stroke={palette.secondary} strokeWidth="10" />
        <path
          d="M244 165 L291 176 L284 207 L237 196Z"
          fill={palette.primary}
          stroke={palette.dark}
          strokeWidth="5"
        />
        <path d="M248 171 L282 179" stroke={palette.accent} strokeWidth="4" />
        <path d="M252 269 L266 272" stroke={palette.accent} strokeWidth="5" />
      </g>
    );
  return null;
}

export function ArenaAvatar({
  appearance,
  name,
  equipment = [],
  compact = false,
  fighter = false,
  injured = false,
}: {
  appearance: ArenaAppearance;
  name: string;
  equipment?: readonly string[];
  compact?: boolean;
  fighter?: boolean;
  injured?: boolean;
}) {
  const rawId = useId().replaceAll(":", "");
  const skyId = `arena-sky-${rawId}`;
  const tunicId = `arena-tunic-${rawId}`;
  const skin = optionColor(ARENA_SKIN_TONES, appearance.skinTone);
  const hair = optionColor(ARENA_HAIR_COLORS, appearance.hairColor);
  const equippedItems = equipment.map(arenaCatalogItem).filter((item) => item !== null);
  const armour = equippedItems.find((item) => item.slot === "ARMOUR");
  const helmet = equippedItems.find((item) => item.slot === "HELMET");
  const shield = equippedItems.find((item) => item.slot === "SHIELD");
  const weapon = equippedItems.find((item) => item.slot === "WEAPON");
  const equipmentLabel = equippedItems.length
    ? ` com ${equippedItems.map((item) => item.name).join(", ")}`
    : "";
  const bodyScale =
    appearance.bodyType === "LIGHT" ? 0.88 : appearance.bodyType === "POWERFUL" ? 1.12 : 1;
  const bodyTranslate =
    appearance.bodyType === "LIGHT" ? 15 : appearance.bodyType === "POWERFUL" ? -15 : 0;

  return (
    <svg
      aria-label={`Prévia de ${name || "novo gladiador"}${equipmentLabel}${injured ? ", em recuperação" : ""}`}
      className={`arena-avatar${compact ? " arena-avatar-compact" : ""}${fighter ? " arena-avatar-fighter" : ""}${injured ? " is-injured" : ""}`}
      role="img"
      viewBox={fighter ? "70 20 220 380" : "0 0 360 440"}
    >
      <defs>
        <linearGradient id={skyId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#17233f" />
          <stop offset=".52" stopColor="#c15b37" />
          <stop offset="1" stopColor="#efb65d" />
        </linearGradient>
        <linearGradient id={tunicId} x1="0" x2="1">
          <stop offset="0" stopColor="#3f315f" />
          <stop offset=".55" stopColor="#76548e" />
          <stop offset="1" stopColor="#2f284a" />
        </linearGradient>
      </defs>
      {!fighter && (
        <>
          <rect fill={`url(#${skyId})`} height="440" rx="28" width="360" />
          <circle cx="293" cy="73" fill="#ffd98a" opacity=".82" r="38" />
          <path d="M0 248 Q76 205 151 239 T360 224 V440 H0Z" fill="#8f402b" opacity=".48" />
          <path d="M0 282 Q92 246 179 279 T360 258 V440 H0Z" fill="#5e2e31" opacity=".65" />
          <g fill="#211b2c" opacity=".72">
            <path d="M12 242 H42 V174 H52 V242 H83 V254 H12Z" />
            <path d="M276 242 H307 V159 H318 V242 H348 V254 H276Z" />
            <path d="M42 184 Q48 142 54 184Z" />
            <path d="M307 169 Q313 123 319 169Z" />
          </g>
          <ellipse cx="180" cy="398" fill="#271c2d" opacity=".48" rx="86" ry="18" />
        </>
      )}

      <g
        className="arena-avatar-breathe"
        transform={`translate(${bodyTranslate} 0) scale(${bodyScale} 1)`}
      >
        <g stroke="#2a1d20" strokeLinecap="round" strokeLinejoin="round">
          <path d="M147 294 L139 376 L163 376 L176 297Z" fill={skin} strokeWidth="4" />
          <path d="M184 297 L197 376 L221 376 L213 294Z" fill={skin} strokeWidth="4" />
          <path
            d="M136 373 Q151 365 166 375 L165 395 H127 Q125 382 136 373Z"
            fill="#39283e"
            strokeWidth="4"
          />
          <path
            d="M194 375 Q209 365 223 374 Q234 382 232 395 H195Z"
            fill="#39283e"
            strokeWidth="4"
          />
          <path
            d="M128 192 Q104 217 98 264 Q96 280 108 283 Q121 282 124 264 L140 220Z"
            fill={skin}
            strokeWidth="4"
          />
          <path
            d="M232 192 Q256 217 262 264 Q264 280 252 283 Q239 282 236 264 L220 220Z"
            fill={skin}
            strokeWidth="4"
          />
          <path
            d="M129 181 Q180 158 231 181 L222 285 Q180 313 138 285Z"
            fill={`url(#${tunicId})`}
            strokeWidth="5"
          />
          <ArmourEquipment
            dataKey={armour?.key}
            itemKey={armour?.visualKey}
            theme={armour?.visualTheme}
          />
          <path d="M128 190 Q114 193 108 209 L127 226 L144 202Z" fill="#9d6a38" strokeWidth="4" />
          <path d="M232 190 Q246 193 252 209 L233 226 L216 202Z" fill="#9d6a38" strokeWidth="4" />
          <path
            d="M137 261 Q180 276 223 261 L221 285 Q180 304 139 285Z"
            fill="#d1a348"
            strokeWidth="4"
          />
          <circle cx="180" cy="278" fill="#f0cf74" r="9" strokeWidth="3" />
          <path d="M111 265 L104 291 L119 297 L127 268Z" fill="#6e4636" strokeWidth="3" />
          <path d="M249 265 L256 291 L241 297 L233 268Z" fill="#6e4636" strokeWidth="3" />
          <path d="M157 151 L154 184 Q180 199 206 184 L203 151Z" fill={skin} strokeWidth="4" />
          <ellipse cx="180" cy="118" fill={skin} rx="51" ry="57" strokeWidth="4" />
          <path d="M131 115 Q122 104 126 127 Q130 143 139 137" fill={skin} strokeWidth="4" />
          <path d="M229 115 Q238 104 234 127 Q230 143 221 137" fill={skin} strokeWidth="4" />
          <g className="arena-avatar-hair" transform="translate(55 -12)">
            <g transform="translate(125 0) scale(1.5 1) translate(-125 0)">
              <Hair appearance={appearance} color={hair} />
            </g>
          </g>
          <HelmetEquipment
            dataKey={helmet?.key}
            itemKey={helmet?.visualKey}
            theme={helmet?.visualTheme}
          />
          <path d="M149 111 Q158 104 167 111" fill="none" strokeWidth="4" />
          <path d="M193 111 Q202 104 211 111" fill="none" strokeWidth="4" />
          <circle cx="159" cy="121" fill="#251d23" r="4" stroke="none" />
          <circle cx="201" cy="121" fill="#251d23" r="4" stroke="none" />
          <path d="M180 122 L174 138 L182 141" fill="none" strokeWidth="3" />
          <path d="M163 151 Q180 160 197 151" fill="none" strokeWidth="3" />
          <g className="arena-avatar-beard" transform="translate(55 24)">
            <Beard appearance={appearance} color={hair} />
          </g>
          {appearance.faceMark === "SCAR" && (
            <path d="M202 102 L191 137" fill="none" stroke="#8d3c38" strokeWidth="4" />
          )}
          {appearance.faceMark === "PAINT" && (
            <path
              d="M138 129 Q180 113 222 129"
              fill="none"
              stroke="#51499b"
              strokeWidth="7"
              opacity=".85"
            />
          )}
          {appearance.faceMark === "TATTOO" && (
            <path d="M143 137 Q151 125 159 137 Q151 145 143 137Z" fill="#314d68" stroke="none" />
          )}
          <ShieldEquipment
            dataKey={shield?.key}
            itemKey={shield?.visualKey}
            theme={shield?.visualTheme}
          />
          <WeaponEquipment
            dataKey={weapon?.key}
            itemKey={weapon?.visualKey}
            theme={weapon?.visualTheme}
          />
        </g>
      </g>
      {!fighter && (
        <g className="arena-avatar-banner">
          <path
            d="M67 410 L82 385 H278 L293 410 L278 433 H82Z"
            fill="#201a2c"
            stroke="#d7a94f"
            strokeWidth="3"
          />
          <text fill="#fff4ce" fontSize="18" fontWeight="800" textAnchor="middle" x="180" y="415">
            {(name || "SEU GLADIADOR").slice(0, 26).toLocaleUpperCase("pt-BR")}
          </text>
        </g>
      )}
      {injured && (
        <g aria-hidden="true" className="arena-avatar-injury">
          <rect height="15" rx="4" transform="rotate(22 161 142)" width="52" x="135" y="135" />
          <path d="M143 135 L181 151 M151 133 L188 148 M155 141 L163 148 M165 145 L173 152" />
        </g>
      )}
    </svg>
  );
}
