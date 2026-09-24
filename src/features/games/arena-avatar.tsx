"use client";

import { useId } from "react";
import { ARENA_HAIR_COLORS, ARENA_SKIN_TONES, type ArenaAppearance } from "@/lib/games/arena";

function optionColor(options: ReadonlyArray<{ id: string; color: string }>, id: string) {
  return options.find((option) => option.id === id)?.color ?? "#777";
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

export function ArenaAvatar({
  appearance,
  name,
  compact = false,
}: {
  appearance: ArenaAppearance;
  name: string;
  compact?: boolean;
}) {
  const rawId = useId().replaceAll(":", "");
  const skyId = `arena-sky-${rawId}`;
  const tunicId = `arena-tunic-${rawId}`;
  const skin = optionColor(ARENA_SKIN_TONES, appearance.skinTone);
  const hair = optionColor(ARENA_HAIR_COLORS, appearance.hairColor);
  const bodyScale =
    appearance.bodyType === "LIGHT" ? 0.88 : appearance.bodyType === "POWERFUL" ? 1.12 : 1;
  const bodyTranslate =
    appearance.bodyType === "LIGHT" ? 15 : appearance.bodyType === "POWERFUL" ? -15 : 0;

  return (
    <svg
      aria-label={`Prévia de ${name || "novo gladiador"}`}
      className={`arena-avatar${compact ? " arena-avatar-compact" : ""}`}
      role="img"
      viewBox="0 0 360 440"
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
          <Hair appearance={appearance} color={hair} />
          <path d="M149 111 Q158 104 167 111" fill="none" strokeWidth="4" />
          <path d="M193 111 Q202 104 211 111" fill="none" strokeWidth="4" />
          <circle cx="159" cy="121" fill="#251d23" r="4" stroke="none" />
          <circle cx="201" cy="121" fill="#251d23" r="4" stroke="none" />
          <path d="M180 122 L174 138 L182 141" fill="none" strokeWidth="3" />
          <path d="M163 151 Q180 160 197 151" fill="none" strokeWidth="3" />
          <Beard appearance={appearance} color={hair} />
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
        </g>
      </g>
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
    </svg>
  );
}
