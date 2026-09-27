"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  ARENA_ATTRIBUTE_DETAILS,
  ARENA_BASE_ATTRIBUTE,
  ARENA_BEARD_STYLES,
  ARENA_BODY_TYPES,
  ARENA_FACE_MARKS,
  ARENA_HAIR_COLORS,
  ARENA_HAIR_STYLES,
  ARENA_MAX_STARTING_ATTRIBUTE,
  ARENA_ORIGINS,
  ARENA_SKIN_TONES,
  DEFAULT_ARENA_APPEARANCE,
  DEFAULT_ARENA_ATTRIBUTES,
  arenaAttributePointsRemaining,
  arenaDerivedStats,
  arenaOptionLabel,
  type ArenaAppearance,
  type ArenaAttributeKey,
  type ArenaAttributes,
} from "@/lib/games/arena";
import {
  ARENA_ITEM_CATALOG,
  ARENA_MAX_ATTRIBUTE,
  arenaModifierLabels,
} from "@/lib/games/arena-economy";
import {
  ARENA_MAX_SHELTER_LEVEL,
  ARENA_SHELTER_ITEM_CATALOG,
  ARENA_SHELTER_STAGES,
  ARENA_SHELTER_STAT_DETAILS,
  arenaShelterModifierLabels,
} from "@/lib/games/arena-shelter";
import type { ArenaBattleView } from "@/server/services/arena-battle-service";
import type { ArenaGladiatorProfile, ArenaLeaderboard } from "@/server/services/arena-service";
import type { ArenaOccupationHub } from "@/server/services/arena-occupation-service";
import type { ArenaPvpHub } from "@/server/services/arena-pvp-service";
import { ArenaAvatar } from "./arena-avatar";
import { ArenaBattle } from "./arena-battle";
import { ArenaOccupations } from "./arena-occupations";
import { ArenaPvp } from "./arena-pvp";
import { ArenaShelter } from "./arena-shelter";

type IdentityDraft = {
  name: string;
  origin: (typeof ARENA_ORIGINS)[number]["id"];
  entryLine: string;
  victoryLine: string;
  appearance: ArenaAppearance;
};

export type ArenaSection = "VILLAGE" | "EXPEDITIONS" | "MERCHANTS" | "CAMP" | "PVP";

function identityFromProfile(profile: ArenaGladiatorProfile | null): IdentityDraft {
  return profile
    ? {
        name: profile.name,
        origin: profile.origin as IdentityDraft["origin"],
        entryLine: profile.entryLine ?? "",
        victoryLine: profile.victoryLine ?? "",
        appearance: profile.appearance,
      }
    : {
        name: "",
        origin: "PORTOS_AMBAR",
        entryLine: "",
        victoryLine: "",
        appearance: DEFAULT_ARENA_APPEARANCE,
      };
}

function formatArenaHistoryDate(value: string | null) {
  if (!value) return "Data indisponível";
  return value.slice(0, 10).split("-").reverse().join("/");
}

const ARENA_HISTORY_STATUS = {
  WON: "Vitória",
  LOST: "Derrota",
  ABANDONED: "Abandono",
  ACTIVE: "Em andamento",
} as const;

const ARENA_MARKET_SECTIONS = [
  { slot: "WEAPON", title: "Forja da Aurora · Armas" },
  { slot: "ARMOUR", title: "Bastião de Bronze · Armaduras" },
  { slot: "HELMET", title: "Bastião de Bronze · Elmos" },
  { slot: "SHIELD", title: "Bastião de Bronze · Escudos" },
] as const;

function ChoiceSelect<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <label htmlFor={id}>
      {label}
      <select id={id} onChange={(event) => onChange(event.target.value as T)} value={value}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ColorChoices({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ id: string; label: string; color: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="arena-color-fieldset">
      <legend>{label}</legend>
      <div className="arena-color-options">
        {options.map((option) => (
          <button
            aria-label={`${label}: ${option.label}`}
            aria-pressed={option.id === value}
            className="arena-color-option"
            key={option.id}
            onClick={() => onChange(option.id)}
            style={{ "--choice-color": option.color } as CSSProperties}
            title={option.label}
            type="button"
          />
        ))}
      </div>
    </fieldset>
  );
}

function DerivedStats({ attributes }: { attributes: ArenaAttributes }) {
  const stats = arenaDerivedStats(attributes);
  return (
    <div className="arena-derived-grid" aria-label="Resumo calculado">
      <span>
        <small>Vida</small>
        <strong>{stats.maxHealth}</strong>
      </span>
      <span>
        <small>Energia</small>
        <strong>{stats.maxEnergy}</strong>
      </span>
      <span>
        <small>Dano base</small>
        <strong>{stats.baseDamage}</strong>
      </span>
      <span>
        <small>Precisão</small>
        <strong>{stats.accuracy}%</strong>
      </span>
    </div>
  );
}

function GladiatorForm({
  profile,
  communityId,
  onSaved,
  onCancel,
}: {
  profile: ArenaGladiatorProfile | null;
  communityId: string;
  onSaved: (profile: ArenaGladiatorProfile) => void;
  onCancel?: () => void;
}) {
  const editing = Boolean(profile);
  const [draft, setDraft] = useState(() => identityFromProfile(profile));
  const [attributes, setAttributes] = useState<ArenaAttributes>(
    profile?.attributes ?? DEFAULT_ARENA_ATTRIBUTES,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const pointsRemaining = arenaAttributePointsRemaining(attributes);
  const origin = ARENA_ORIGINS.find((option) => option.id === draft.origin)!;

  function setAppearance<Key extends keyof ArenaAppearance>(key: Key, value: ArenaAppearance[Key]) {
    setDraft((current) => ({
      ...current,
      appearance: { ...current.appearance, [key]: value },
    }));
  }

  function changeAttribute(key: ArenaAttributeKey, delta: number) {
    setAttributes((current) => {
      const nextValue = current[key] + delta;
      if (nextValue < ARENA_BASE_ATTRIBUTE || nextValue > ARENA_MAX_STARTING_ATTRIBUTE)
        return current;
      if (delta > 0 && arenaAttributePointsRemaining(current) <= 0) return current;
      return { ...current, [key]: nextValue };
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/communities/${communityId}/games/arena/gladiator`, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editing ? draft : { ...draft, attributes }),
      });
      const payload = (await response.json()) as {
        gladiator?: ArenaGladiatorProfile;
        error?: string;
      };
      if (!response.ok || !payload.gladiator)
        throw new Error(payload.error || "Não foi possível salvar seu gladiador.");
      onSaved(payload.gladiator);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar seu gladiador.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      aria-label={editing ? "Editar gladiador" : "Criar gladiador"}
      className="arena-creator"
      onSubmit={submit}
    >
      <aside className="arena-creator-preview">
        <div className="arena-preview-sticky">
          <div className="eyebrow">{editing ? "Nova aparência" : "Seu futuro campeão"}</div>
          <ArenaAvatar appearance={draft.appearance} name={draft.name} />
          <DerivedStats attributes={attributes} />
        </div>
      </aside>

      <div className="arena-creator-fields">
        <header>
          <div className="eyebrow">Arena dos Campeões · Fase 1</div>
          <h1>{editing ? "Ajuste sua identidade" : "Forje seu gladiador"}</h1>
          <p className="lead">
            {editing
              ? "A aparência e as frases podem mudar sem alterar sua construção de atributos."
              : "Toda lenda começa com um nome, uma origem e escolhas que definem seu estilo."}
          </p>
        </header>

        <section className="arena-form-section" aria-labelledby="arena-identity-title">
          <div className="arena-form-section-heading">
            <span>01</span>
            <div>
              <h2 id="arena-identity-title">Identidade</h2>
              <p className="muted">Como a arena conhecerá você.</p>
            </div>
          </div>
          <div className="arena-form-grid">
            <label htmlFor="arena-name">
              Nome do gladiador
              <input
                autoComplete="off"
                id="arena-name"
                maxLength={40}
                minLength={2}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Ex.: Cassius Aurora"
                required
                value={draft.name}
              />
            </label>
            <label htmlFor="arena-origin">
              Origem
              <select
                id="arena-origin"
                onChange={(event) =>
                  setDraft({ ...draft, origin: event.target.value as IdentityDraft["origin"] })
                }
                value={draft.origin}
              >
                {ARENA_ORIGINS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="field-hint">{origin.description}</span>
            </label>
            <label className="arena-full-field" htmlFor="arena-entry-line">
              Frase de entrada <span className="muted">(opcional)</span>
              <input
                id="arena-entry-line"
                maxLength={120}
                onChange={(event) => setDraft({ ...draft, entryLine: event.target.value })}
                placeholder="A areia se lembrará dos meus passos."
                value={draft.entryLine}
              />
            </label>
            <label className="arena-full-field" htmlFor="arena-victory-line">
              Frase de vitória <span className="muted">(opcional)</span>
              <input
                id="arena-victory-line"
                maxLength={120}
                onChange={(event) => setDraft({ ...draft, victoryLine: event.target.value })}
                placeholder="Que venha o próximo!"
                value={draft.victoryLine}
              />
            </label>
          </div>
        </section>

        <section className="arena-form-section" aria-labelledby="arena-appearance-title">
          <div className="arena-form-section-heading">
            <span>02</span>
            <div>
              <h2 id="arena-appearance-title">Aparência</h2>
              <p className="muted">Um visual original montado em camadas.</p>
            </div>
          </div>
          <div className="arena-form-grid">
            <ChoiceSelect
              id="arena-body"
              label="Porte físico"
              onChange={(value) => setAppearance("bodyType", value)}
              options={ARENA_BODY_TYPES}
              value={draft.appearance.bodyType}
            />
            <ChoiceSelect
              id="arena-hair"
              label="Cabelo"
              onChange={(value) => setAppearance("hairStyle", value)}
              options={ARENA_HAIR_STYLES}
              value={draft.appearance.hairStyle}
            />
            <ChoiceSelect
              id="arena-beard"
              label="Barba"
              onChange={(value) => setAppearance("beardStyle", value)}
              options={ARENA_BEARD_STYLES}
              value={draft.appearance.beardStyle}
            />
            <ChoiceSelect
              id="arena-mark"
              label="Marca facial"
              onChange={(value) => setAppearance("faceMark", value)}
              options={ARENA_FACE_MARKS}
              value={draft.appearance.faceMark}
            />
            <ColorChoices
              label="Tom de pele"
              onChange={(value) => setAppearance("skinTone", value as ArenaAppearance["skinTone"])}
              options={ARENA_SKIN_TONES}
              value={draft.appearance.skinTone}
            />
            <ColorChoices
              label="Cor do cabelo"
              onChange={(value) =>
                setAppearance("hairColor", value as ArenaAppearance["hairColor"])
              }
              options={ARENA_HAIR_COLORS}
              value={draft.appearance.hairColor}
            />
          </div>
        </section>

        {!editing && (
          <section className="arena-form-section" aria-labelledby="arena-attributes-title">
            <div className="arena-form-section-heading">
              <span>03</span>
              <div>
                <h2 id="arena-attributes-title">Atributos</h2>
                <p className="muted">Retire pontos de um atributo para reforçar outro.</p>
              </div>
              <strong className={`arena-points-badge${pointsRemaining ? " has-points" : ""}`}>
                {pointsRemaining} ponto{Math.abs(pointsRemaining) === 1 ? "" : "s"} livre
                {Math.abs(pointsRemaining) === 1 ? "" : "s"}
              </strong>
            </div>
            <div className="arena-attribute-editor">
              {ARENA_ATTRIBUTE_DETAILS.map((attribute) => (
                <div className="arena-attribute-row" key={attribute.key}>
                  <div>
                    <strong>{attribute.label}</strong>
                    <small>{attribute.description}</small>
                  </div>
                  <div className="arena-stepper">
                    <button
                      aria-label={`Diminuir ${attribute.label}`}
                      disabled={attributes[attribute.key] <= ARENA_BASE_ATTRIBUTE}
                      onClick={() => changeAttribute(attribute.key, -1)}
                      type="button"
                    >
                      −
                    </button>
                    <output aria-label={`${attribute.label}: ${attributes[attribute.key]}`}>
                      {attributes[attribute.key]}
                    </output>
                    <button
                      aria-label={`Aumentar ${attribute.label}`}
                      disabled={
                        attributes[attribute.key] >= ARENA_MAX_STARTING_ATTRIBUTE ||
                        pointsRemaining <= 0
                      }
                      onClick={() => changeAttribute(attribute.key, 1)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="arena-form-actions">
          {onCancel && (
            <button
              className="button secondary"
              disabled={pending}
              onClick={onCancel}
              type="button"
            >
              Cancelar
            </button>
          )}
          <button
            className="button arena-primary-button"
            disabled={pending || (!editing && pointsRemaining !== 0)}
            type="submit"
          >
            {pending ? "Salvando…" : editing ? "Salvar aparência" : "Entrar na vila"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Village({
  profile,
  communityId,
  onEdit,
  onArena,
  onProfileChange,
  hasActiveBattle,
  communitySlug,
  leaderboard,
  onDeleted,
  occupationHub,
  onOccupationHubChange,
  onOccupationSettled,
  pvpHub,
  onPvpHubChange,
  section,
}: {
  profile: ArenaGladiatorProfile;
  communityId: string;
  onEdit: () => void;
  onArena: () => void;
  onProfileChange: (profile: ArenaGladiatorProfile) => void;
  hasActiveBattle: boolean;
  communitySlug: string;
  leaderboard: ArenaLeaderboard;
  onDeleted: () => void;
  occupationHub: ArenaOccupationHub;
  onOccupationHubChange: (hub: ArenaOccupationHub) => void;
  onOccupationSettled: () => Promise<void>;
  pvpHub: ArenaPvpHub | null;
  onPvpHubChange: (hub: ArenaPvpHub) => void;
  section: ArenaSection;
}) {
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const originLabel = arenaOptionLabel(ARENA_ORIGINS, profile.origin);
  const experiencePercentage = Math.max(
    0,
    Math.min(
      100,
      profile.progression.isMaximum
        ? 100
        : (profile.progression.experienceIntoLevel / profile.progression.experienceNeeded) * 100,
    ),
  );
  const derivedEntries = [
    ["Vida", profile.derived.maxHealth],
    ["Energia", profile.derived.maxEnergy],
    ["Dano base", profile.derived.baseDamage],
    ["Precisão", `${profile.derived.accuracy}%`],
    ["Esquiva", `${profile.derived.evasion}%`],
    ["Guarda", profile.derived.guard],
  ];
  const ownedKeys = new Set(profile.inventory.map((item) => item.catalogItemKey));
  const equippedKeys = profile.inventory
    .filter((item) => item.equippedSlot)
    .map((item) => item.catalogItemKey);
  const occupied = Boolean(
    occupationHub.active || profile.condition.injured || profile.pvp.activeRaidEndsAt,
  );
  const shelterOwnedKeys = new Set(profile.shelter.items.map((item) => item.catalogItemKey));

  async function mutateProfile(
    action: string,
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
  ) {
    setPendingAction(action);
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        gladiator?: ArenaGladiatorProfile;
        error?: string;
      };
      if (!response.ok || !payload.gladiator)
        throw new Error(payload.error || "A vila não conseguiu concluir a operação.");
      onProfileChange(payload.gladiator);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "A vila não conseguiu concluir a operação.",
      );
    } finally {
      setPendingAction("");
    }
  }

  function purchase(catalogItemKey: string) {
    return mutateProfile(
      `buy-${catalogItemKey}`,
      `/api/communities/${communityId}/games/arena/gladiator/items`,
      "POST",
      { catalogItemKey },
    );
  }

  function equip(itemId: string, equipped: boolean) {
    return mutateProfile(
      `equip-${itemId}`,
      `/api/communities/${communityId}/games/arena/gladiator/items/${itemId}`,
      "PATCH",
      { equipped },
    );
  }

  function spendPoint(attribute: ArenaAttributeKey) {
    return mutateProfile(
      `attribute-${attribute}`,
      `/api/communities/${communityId}/games/arena/gladiator/attributes`,
      "POST",
      { attribute },
    );
  }

  function upgradeShelter() {
    return mutateProfile(
      "shelter-upgrade",
      `/api/communities/${communityId}/games/arena/gladiator/shelter`,
      "POST",
      {},
    );
  }

  function purchaseShelterItem(catalogItemKey: string) {
    return mutateProfile(
      `shelter-item-${catalogItemKey}`,
      `/api/communities/${communityId}/games/arena/gladiator/shelter/items`,
      "POST",
      { catalogItemKey },
    );
  }

  async function resetGladiator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("reset");
    setError("");
    try {
      const response = await fetch(`/api/communities/${communityId}/games/arena/gladiator`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: resetConfirmation }),
      });
      const payload = (await response.json()) as {
        result?: { deleted: true };
        error?: string;
      };
      if (!response.ok || !payload.result?.deleted)
        throw new Error(payload.error || "Não foi possível reiniciar o personagem.");
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível reiniciar o personagem.");
    } finally {
      setPendingAction("");
    }
  }

  return (
    <div className="arena-village">
      <Link
        className="back-link"
        href={
          section === "VILLAGE"
            ? `/app/${communitySlug}/games`
            : `/app/${communitySlug}/games/arena`
        }
      >
        ← {section === "VILLAGE" ? "Voltar aos jogos" : "Voltar à Vila do Sol"}
      </Link>
      <header className="arena-village-hero">
        <div className="arena-village-sky" aria-hidden="true">
          <span className="arena-village-sun" />
          <span className="arena-village-tower left" />
          <span className="arena-village-tower right" />
        </div>
        <div className="arena-village-copy">
          <div className="eyebrow">Arena dos Campeões · Vila do Sol</div>
          <h1>Bem-vindo à areia, {profile.name}</h1>
          <p>
            O ferreiro aquece a forja, os portões do coliseu estão abertos e sua história acaba de
            começar.
          </p>
          <div className="arena-village-currencies" aria-label="Recursos do gladiador">
            <span>◈ {profile.gold.toLocaleString("pt-BR")} moedas</span>
            <span>★ {profile.fame} fama</span>
            <span>⬢ {profile.shelter.points} pontos do Refúgio</span>
            <span>Nível {profile.level}</span>
            {profile.unspentSkillPoints > 0 && (
              <span>✦ {profile.unspentSkillPoints} pontos de atributo</span>
            )}
          </div>
          <div
            className="arena-experience"
            aria-label={
              profile.progression.isMaximum
                ? `Nível máximo ${profile.progression.maxLevel}`
                : "Progresso para o próximo nível"
            }
          >
            <div>
              <span>Experiência</span>
              <strong>
                {profile.progression.isMaximum
                  ? `Nível máximo · ${profile.progression.maxLevel}`
                  : `${profile.progression.experienceIntoLevel}/${profile.progression.experienceNeeded}`}
              </strong>
            </div>
            <i style={{ width: `${experiencePercentage}%` }} />
          </div>
        </div>
      </header>

      <nav aria-label="Áreas da Vila do Sol" className="arena-section-nav">
        <Link
          aria-current={section === "VILLAGE" ? "page" : undefined}
          href={`/app/${communitySlug}/games/arena`}
        >
          Vila
        </Link>
        <Link
          aria-current={section === "EXPEDITIONS" ? "page" : undefined}
          href={`/app/${communitySlug}/games/arena/expeditions`}
        >
          Expedições
        </Link>
        <Link
          aria-current={section === "MERCHANTS" ? "page" : undefined}
          href={`/app/${communitySlug}/games/arena/merchants`}
        >
          Mercadores
        </Link>
        <Link
          aria-current={section === "CAMP" ? "page" : undefined}
          href={`/app/${communitySlug}/games/arena/camp`}
        >
          Acampamento
        </Link>
        <Link
          aria-current={section === "PVP" ? "page" : undefined}
          href={`/app/${communitySlug}/games/arena/pvp`}
        >
          PvP
          {profile.pvp.incomingActiveCount > 0 && (
            <span
              className="arena-pvp-nav-alert"
              aria-label={`${profile.pvp.incomingActiveCount} ataque(s) recebido(s)`}
            >
              {profile.pvp.incomingActiveCount}
            </span>
          )}
        </Link>
      </nav>

      <div className="arena-village-layout">
        <aside className="card arena-profile-card">
          <ArenaAvatar
            appearance={profile.appearance}
            compact
            equipment={equippedKeys}
            injured={profile.condition.injured}
            name={profile.name}
          />
          <div className="arena-profile-title">
            <div>
              <h2>{profile.name}</h2>
              <p>{originLabel}</p>
            </div>
            <button
              className="button secondary compact"
              disabled={occupied}
              onClick={onEdit}
              type="button"
            >
              Editar visual
            </button>
          </div>
          {profile.entryLine && <blockquote>“{profile.entryLine}”</blockquote>}
          <div className="arena-record">
            <span>
              <strong>{profile.wins}</strong>
              <small>vitórias</small>
            </span>
            <span>
              <strong>{profile.losses}</strong>
              <small>derrotas</small>
            </span>
            <span>
              <strong>{profile.experience}</strong>
              <small>experiência</small>
            </span>
          </div>
        </aside>

        <div className="arena-village-main">
          <div className="arena-campaign-grid" hidden={section !== "VILLAGE"}>
            <section className="card arena-campaign-card" aria-labelledby="arena-campaign-title">
              <div className="card-header">
                <div>
                  <div className="eyebrow">Campanha · Liga {profile.campaign.league}</div>
                  <h2 id="arena-campaign-title">
                    {profile.campaign.league === 1
                      ? "Caminho até a Campeã Solar"
                      : `Desafiantes da Liga ${profile.campaign.league}`}
                  </h2>
                </div>
                <span className="pill">{profile.campaign.completions} concluída(s)</span>
              </div>
              <ol className="arena-campaign-path">
                {profile.campaign.opponents.map((opponent, index) => {
                  const state =
                    index < profile.campaign.step
                      ? "complete"
                      : index === profile.campaign.step
                        ? "current"
                        : "locked";
                  return (
                    <li className={state} key={opponent.key}>
                      <span aria-hidden="true">{state === "complete" ? "✓" : index + 1}</span>
                      <div>
                        <strong>
                          {opponent.name} · nível {opponent.level}
                        </strong>
                        <small>
                          {state === "complete"
                            ? "Vencido nesta campanha"
                            : state === "current"
                              ? opponent.difficulty === "CHEFE"
                                ? "Chefe desbloqueada"
                                : "Próximo confronto"
                              : "Portão bloqueado"}
                        </small>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="muted">
                Agora: enfrente <strong>{profile.campaign.opponentName}</strong>. Cada liga traz
                novos rivais, equipamentos e dificuldade; revanche não perde seu avanço.
              </p>
              {profile.campaign.previousLeague && (
                <p className="arena-previous-league-note">
                  <strong>Liga {profile.campaign.previousLeague.league} disponível:</strong> seus
                  quatro rivais permanecem nos portões para treino, experiência e recursos.
                </p>
              )}
            </section>

            <section className="card arena-ranking-card" aria-labelledby="arena-ranking-title">
              <div className="card-header">
                <div>
                  <div className="eyebrow">Prestígio da comunidade</div>
                  <h2 id="arena-ranking-title">Ranking dos gladiadores</h2>
                </div>
                <span className="pill">Top 20</span>
              </div>
              {leaderboard.length ? (
                <ol className="arena-ranking-list">
                  {leaderboard.map((entry) => (
                    <li className={entry.id === profile.id ? "is-me" : ""} key={entry.id}>
                      <span>{entry.rank}º</span>
                      <div>
                        <strong>{entry.name}</strong>
                        <small>
                          Nível {entry.level} · {entry.wins} vitória(s)
                        </small>
                      </div>
                      <div>
                        <strong>{entry.campaignCompletions} campanha(s)</strong>
                        <small>★ {entry.fame} fama</small>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">O primeiro gladiador da comunidade inaugurará o ranking.</p>
              )}
            </section>
          </div>

          <section
            className="card arena-shelter-card"
            aria-labelledby="arena-shelter-title"
            hidden={section !== "CAMP"}
          >
            <div className="card-header">
              <div>
                <div className="eyebrow">Domínio do gladiador · Refúgio</div>
                <h2 id="arena-shelter-title">{profile.shelter.name}</h2>
              </div>
              <span className="pill">
                Nível {profile.shelter.level}/{ARENA_MAX_SHELTER_LEVEL}
              </span>
            </div>
            <div className="arena-shelter-layout">
              <ArenaShelter
                itemKeys={profile.shelter.items.map((item) => item.catalogItemKey)}
                level={profile.shelter.level}
                name={profile.shelter.name}
              />
              <div className="arena-shelter-details">
                <div>
                  <p className="lead">{profile.shelter.description}</p>
                  <p className="muted">
                    Duelos concluídos concedem pontos para ampliar o lugar. Itens comprados melhoram
                    os atributos do Acampamento e reforçam a defesa em ataques PvP.
                  </p>
                </div>
                <ol className="arena-shelter-stages" aria-label="Etapas do Refúgio">
                  {ARENA_SHELTER_STAGES.map((stage) => {
                    const stageLevel = stage.level;
                    const state =
                      stageLevel < profile.shelter.level
                        ? "complete"
                        : stageLevel === profile.shelter.level
                          ? "current"
                          : "locked";
                    return (
                      <li
                        aria-label={`Nível ${stageLevel}: ${stage.name}`}
                        className={state}
                        key={stageLevel}
                        title={stage.name}
                      >
                        {state === "complete" ? "✓" : stageLevel}
                      </li>
                    );
                  })}
                </ol>
                <div className="arena-shelter-progress">
                  <div>
                    <span>Pontos disponíveis</span>
                    <strong>
                      ⬢ {profile.shelter.points}
                      {profile.shelter.nextCost === null
                        ? " · máximo"
                        : `/${profile.shelter.nextCost}`}
                    </strong>
                  </div>
                  <div
                    aria-label={
                      profile.shelter.nextCost === null
                        ? "Refúgio no nível máximo"
                        : `${profile.shelter.points} de ${profile.shelter.nextCost} pontos para melhorar`
                    }
                    aria-valuemax={profile.shelter.nextCost ?? Math.max(1, profile.shelter.points)}
                    aria-valuemin={0}
                    aria-valuenow={
                      profile.shelter.nextCost === null
                        ? Math.max(1, profile.shelter.points)
                        : Math.min(profile.shelter.points, profile.shelter.nextCost)
                    }
                    className="arena-shelter-progress-track"
                    role="progressbar"
                  >
                    <i style={{ width: `${profile.shelter.progressPercentage}%` }} />
                  </div>
                </div>
                <button
                  className="button arena-primary-button"
                  disabled={
                    occupied ||
                    Boolean(pendingAction) ||
                    profile.shelter.isMaximum ||
                    !profile.shelter.canUpgrade
                  }
                  onClick={upgradeShelter}
                  type="button"
                >
                  {pendingAction === "shelter-upgrade"
                    ? "Construindo…"
                    : profile.shelter.isMaximum
                      ? "Refúgio no nível máximo"
                      : profile.shelter.canUpgrade
                        ? `Melhorar para ${profile.shelter.nextStage?.name}`
                        : `Faltam ${Math.max(0, (profile.shelter.nextCost ?? 0) - profile.shelter.points)} pontos`}
                </button>
                <p className="arena-shelter-future">
                  <span aria-hidden="true">⚑</span>A Defesa e os demais status deste domínio ajudam
                  seu gladiador a resistir a saques PvP.
                </p>
              </div>
            </div>
          </section>

          <section
            className="card arena-camp-improvements"
            aria-labelledby="arena-camp-improvements-title"
            hidden={section !== "CAMP"}
          >
            <div className="card-header">
              <div>
                <div className="eyebrow">Oficina do domínio</div>
                <h2 id="arena-camp-improvements-title">Itens do Acampamento</h2>
              </div>
              <span className="pill">◈ {profile.gold.toLocaleString("pt-BR")}</span>
            </div>
            <div className="arena-camp-stats" aria-label="Atributos do Acampamento">
              {ARENA_SHELTER_STAT_DETAILS.map((stat) => (
                <span key={stat.key}>
                  <i aria-hidden="true">{stat.icon}</i>
                  <small>{stat.label}</small>
                  <strong>{profile.shelter.stats[stat.key]}</strong>
                </span>
              ))}
            </div>
            <p className="muted">
              Estes atributos pertencem ao Refúgio. Eles não alteram os duelos do Coliseu, mas
              fortalecem a defesa automática contra saques PvP.
            </p>
            <div className="arena-camp-shop">
              {ARENA_SHELTER_ITEM_CATALOG.map((item) => {
                const owned = shelterOwnedKeys.has(item.key);
                const levelLocked = profile.shelter.level < item.requiredLevel;
                const insufficientGold = profile.gold < item.price;
                return (
                  <article key={item.key}>
                    <span aria-hidden="true">{item.icon}</span>
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.description}</p>
                      <small>{arenaShelterModifierLabels(item.modifiers).join(" · ")}</small>
                    </div>
                    <button
                      className="button secondary compact"
                      disabled={
                        occupied ||
                        Boolean(pendingAction) ||
                        owned ||
                        levelLocked ||
                        insufficientGold
                      }
                      onClick={() => purchaseShelterItem(item.key)}
                      title={
                        owned
                          ? "Este item já pertence ao Acampamento."
                          : levelLocked
                            ? `Exige Acampamento nível ${item.requiredLevel}.`
                            : insufficientGold
                              ? "Moedas insuficientes."
                              : `Comprar por ${item.price} moedas.`
                      }
                      type="button"
                    >
                      {pendingAction === `shelter-item-${item.key}`
                        ? "Construindo…"
                        : owned
                          ? "Instalado"
                          : levelLocked
                            ? `Nível ${item.requiredLevel}`
                            : `◈ ${item.price}`}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          <div hidden={section !== "EXPEDITIONS"}>
            <ArenaOccupations
              communityId={communityId}
              hasActiveBattle={hasActiveBattle}
              hub={occupationHub}
              level={profile.level}
              onChange={onOccupationHubChange}
              onSettled={onOccupationSettled}
            />
          </div>

          <section
            className="arena-location-grid"
            aria-label="Locais da vila"
            hidden={section !== "VILLAGE"}
          >
            <article className="arena-location-card forge">
              <span className="arena-location-icon" aria-hidden="true">
                ⚒
              </span>
              <div>
                <div className="eyebrow">Estradas além dos portões</div>
                <h2>Expedições</h2>
                <p>Treine, cumpra missões, receba recompensas e desenvolva seus atributos.</p>
              </div>
              <Link
                className="button secondary compact"
                href={`/app/${communitySlug}/games/arena/expeditions`}
              >
                Abrir Expedições
              </Link>
            </article>
            <article className="arena-location-card armoury">
              <span className="arena-location-icon" aria-hidden="true">
                ◒
              </span>
              <div>
                <div className="eyebrow">Forja e Bastião de Bronze</div>
                <h2>Mercadores</h2>
                <p>Compre armas e armaduras, organize o inventário e equipe seu gladiador.</p>
              </div>
              <Link
                className="button secondary compact"
                href={`/app/${communitySlug}/games/arena/merchants`}
              >
                Visitar Mercadores
              </Link>
            </article>
            <article className="arena-location-card trainer">
              <span className="arena-location-icon" aria-hidden="true">
                ◎
              </span>
              <div>
                <div className="eyebrow">Domínio particular</div>
                <h2>Acampamento</h2>
                <p>Amplie seu Refúgio, instale melhorias e desenvolva os status da base.</p>
              </div>
              <Link
                className="button secondary compact"
                href={`/app/${communitySlug}/games/arena/camp`}
              >
                Ir ao Acampamento
              </Link>
            </article>
            <article className="arena-location-card gates arena-location-active">
              <span className="arena-location-icon" aria-hidden="true">
                ♜
              </span>
              <div>
                <div className="eyebrow">Portões do Coliseu</div>
                <h2>Arena de combate</h2>
                <p>Enfrente adversários controlados pela arena em duelos laterais por turnos.</p>
              </div>
              <button
                className="button arena-gates-button"
                disabled={occupied}
                onClick={onArena}
                type="button"
              >
                {occupied
                  ? "Gladiador em atividade"
                  : hasActiveBattle
                    ? "Retomar duelo"
                    : "Atravessar os portões"}
              </button>
            </article>
            <article className="arena-location-card pvp">
              <span className="arena-location-icon" aria-hidden="true">
                ⚔
              </span>
              <div>
                <div className="eyebrow">Disputas da comunidade</div>
                <h2>Incursões PvP</h2>
                <p>Saqueie Refúgios rivais ou acompanhe os ataques sofridos pelo seu domínio.</p>
              </div>
              <Link
                className="button secondary compact"
                href={`/app/${communitySlug}/games/arena/pvp`}
              >
                {profile.pvp.incomingActiveCount
                  ? `${profile.pvp.incomingActiveCount} ataque(s) recebido(s)`
                  : "Abrir PvP"}
              </Link>
            </article>
          </section>

          {section === "PVP" && pvpHub && (
            <ArenaPvp
              communityId={communityId}
              hasActiveBattle={hasActiveBattle}
              hasActiveOccupation={Boolean(occupationHub.active)}
              hub={pvpHub}
              onChange={onPvpHubChange}
              onProfileRefresh={onOccupationSettled}
            />
          )}

          <section
            className="card arena-market"
            aria-labelledby="arena-market-title"
            hidden={section !== "MERCHANTS"}
          >
            <div className="card-header">
              <div>
                <div className="eyebrow">Mercado da Vila · Fase 3</div>
                <h2 id="arena-market-title">Equipamentos dos mercadores</h2>
              </div>
              <span className="pill">◈ {profile.gold.toLocaleString("pt-BR")}</span>
            </div>
            <div className="arena-market-grid">
              {ARENA_MARKET_SECTIONS.map((marketSection) => (
                <section key={marketSection.slot}>
                  <h3>{marketSection.title}</h3>
                  <div className="arena-shop-list">
                    {ARENA_ITEM_CATALOG.filter((item) => item.slot === marketSection.slot).map(
                      (item) => {
                        const owned = ownedKeys.has(item.key);
                        const levelLocked = profile.level < item.requiredLevel;
                        const insufficientGold = profile.gold < item.price;
                        return (
                          <article className="arena-shop-item" key={item.key}>
                            <span aria-hidden="true">{item.icon}</span>
                            <div>
                              <strong>{item.name}</strong>
                              <p>{item.description}</p>
                              <small>
                                Nível {item.requiredLevel} ·{" "}
                                {arenaModifierLabels(item.modifiers).join(" · ")}
                              </small>
                            </div>
                            <button
                              className="button secondary compact"
                              disabled={
                                occupied ||
                                Boolean(pendingAction) ||
                                owned ||
                                levelLocked ||
                                insufficientGold
                              }
                              onClick={() => purchase(item.key)}
                              title={
                                owned
                                  ? "Você já possui este item."
                                  : levelLocked
                                    ? `Exige nível ${item.requiredLevel}.`
                                    : insufficientGold
                                      ? "Moedas insuficientes."
                                      : `Comprar por ${item.price} moedas.`
                              }
                              type="button"
                            >
                              {pendingAction === `buy-${item.key}`
                                ? "Comprando…"
                                : owned
                                  ? "Adquirido"
                                  : levelLocked
                                    ? `Nível ${item.requiredLevel}`
                                    : `◈ ${item.price}`}
                            </button>
                          </article>
                        );
                      },
                    )}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <div
            className="arena-sheet-grid"
            hidden={section !== "EXPEDITIONS" && section !== "MERCHANTS"}
          >
            <section className="card arena-stats-card" hidden={section !== "EXPEDITIONS"}>
              <div className="card-header">
                <div>
                  <div className="eyebrow">Construção</div>
                  <h2>Atributos</h2>
                </div>
                <span className="pill">
                  {profile.unspentSkillPoints} ponto{profile.unspentSkillPoints === 1 ? "" : "s"}
                </span>
              </div>
              <div className="arena-attribute-sheet">
                {ARENA_ATTRIBUTE_DETAILS.map((attribute) => (
                  <div key={attribute.key}>
                    <span>{attribute.shortLabel}</span>
                    <strong>{profile.attributes[attribute.key]}</strong>
                    <small>{attribute.label}</small>
                    {profile.unspentSkillPoints > 0 && (
                      <button
                        aria-label={`Aumentar ${attribute.label}`}
                        disabled={
                          occupied ||
                          Boolean(pendingAction) ||
                          profile.attributes[attribute.key] >= ARENA_MAX_ATTRIBUTE
                        }
                        onClick={() => spendPoint(attribute.key)}
                        type="button"
                      >
                        {pendingAction === `attribute-${attribute.key}` ? "…" : "+"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="arena-derived-list">
                {derivedEntries.map(([label, value]) => (
                  <span key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </span>
                ))}
              </div>
            </section>

            <section className="card arena-inventory-card" hidden={section !== "MERCHANTS"}>
              <div className="card-header">
                <div>
                  <div className="eyebrow">Equipamentos</div>
                  <h2>Inventário</h2>
                </div>
                <span className="pill">{profile.inventory.length} itens</span>
              </div>
              {profile.inventory.length === 0 ? (
                <div className="arena-empty-inventory">
                  <span aria-hidden="true">◇</span>
                  <h3>Seu baú está vazio</h3>
                  <p className="muted">
                    Você começa com 500 moedas. Escolha seu primeiro equipamento no mercado da vila.
                  </p>
                </div>
              ) : (
                <ul className="arena-inventory-list">
                  {profile.inventory.map((item) => (
                    <li key={item.id}>
                      <span aria-hidden="true">{item.catalog?.icon ?? "◇"}</span>
                      <div>
                        <strong>{item.catalog?.name ?? item.catalogItemKey}</strong>
                        <small>
                          {item.catalog
                            ? arenaModifierLabels(item.catalog.modifiers).join(" · ")
                            : "Item legado"}
                        </small>
                      </div>
                      {item.catalog && (
                        <button
                          className="button secondary compact"
                          disabled={occupied || Boolean(pendingAction)}
                          onClick={() => equip(item.id, !item.equippedSlot)}
                          type="button"
                        >
                          {pendingAction === `equip-${item.id}`
                            ? "Salvando…"
                            : item.equippedSlot
                              ? "Remover"
                              : "Equipar"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="arena-legacy-grid" hidden={section !== "VILLAGE"}>
            <section className="card arena-achievements-card" aria-labelledby="arena-legacy-title">
              <div className="card-header">
                <div>
                  <div className="eyebrow">Legado · Fase 5</div>
                  <h2 id="arena-legacy-title">Conquistas do gladiador</h2>
                </div>
                <span className="pill">
                  {profile.legacy.unlockedCount}/{profile.legacy.badges.length}
                </span>
              </div>
              <div className="arena-legacy-summary">
                <span>
                  <strong>{profile.legacy.totalBattles}</strong>
                  <small>duelos</small>
                </span>
                <span>
                  <strong>{profile.legacy.winRate}%</strong>
                  <small>aproveitamento</small>
                </span>
                <span>
                  <strong>{profile.campaign.completions}</strong>
                  <small>campanhas</small>
                </span>
              </div>
              <ul className="arena-badge-list">
                {profile.legacy.badges.map((badge) => (
                  <li className={badge.unlocked ? "unlocked" : "locked"} key={badge.key}>
                    <span aria-hidden="true">{badge.unlocked ? badge.icon : "◇"}</span>
                    <div>
                      <strong>{badge.name}</strong>
                      <small>{badge.description}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card arena-history-card" aria-labelledby="arena-history-title">
              <div className="card-header">
                <div>
                  <div className="eyebrow">Crônicas da areia</div>
                  <h2 id="arena-history-title">Duelos recentes</h2>
                </div>
                <span className="pill">Últimos 8</span>
              </div>
              {profile.history.length ? (
                <ol className="arena-history-list">
                  {profile.history.map((battle) => (
                    <li className={battle.status.toLowerCase()} key={battle.id}>
                      <span aria-hidden="true">{battle.status === "WON" ? "♛" : "◇"}</span>
                      <div>
                        <strong>{battle.opponentName}</strong>
                        <small>
                          {formatArenaHistoryDate(battle.finishedAt)} · {battle.round} rodada(s)
                        </small>
                      </div>
                      <div>
                        <strong>{ARENA_HISTORY_STATUS[battle.status]}</strong>
                        <small>
                          +{battle.goldReward} moedas · +{battle.fameReward} fama · +
                          {battle.shelterPointsReward} Refúgio
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="arena-empty-history">
                  <span aria-hidden="true">☼</span>
                  <p>Seus resultados aparecerão aqui após o primeiro duelo.</p>
                </div>
              )}
            </section>
          </div>

          <section
            className="card arena-danger-zone"
            aria-labelledby="arena-reset-title"
            hidden={section !== "VILLAGE"}
          >
            <div>
              <div className="eyebrow">Gestão do personagem</div>
              <h2 id="arena-reset-title">Reiniciar personagem</h2>
              <p>
                Apaga definitivamente ficha, equipamentos, campanhas e todo o histórico de duelos.
                Depois disso você poderá criar um novo gladiador do zero.
              </p>
            </div>
            {!resetOpen ? (
              <button
                className="button danger compact"
                disabled={occupied || Boolean(pendingAction)}
                onClick={() => setResetOpen(true)}
                type="button"
              >
                Reiniciar personagem
              </button>
            ) : (
              <form className="arena-reset-form" onSubmit={resetGladiator}>
                <label htmlFor="arena-reset-confirmation">
                  Digite <strong>{profile.name}</strong> para confirmar
                  <input
                    autoComplete="off"
                    id="arena-reset-confirmation"
                    onChange={(event) => setResetConfirmation(event.target.value)}
                    value={resetConfirmation}
                  />
                </label>
                <div>
                  <button
                    className="button secondary compact"
                    disabled={pendingAction === "reset"}
                    onClick={() => {
                      setResetOpen(false);
                      setResetConfirmation("");
                    }}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="button danger compact"
                    disabled={
                      occupied ||
                      pendingAction === "reset" ||
                      resetConfirmation.trim() !== profile.name
                    }
                    type="submit"
                  >
                    {pendingAction === "reset" ? "Apagando…" : "Apagar tudo e recomeçar"}
                  </button>
                </div>
              </form>
            )}
          </section>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ArenaGame({
  communityId,
  communitySlug,
  initialBattle,
  initialProfile,
  initialLeaderboard,
  initialOccupationHub,
  initialPvpHub,
  initialSection = "VILLAGE",
}: {
  communityId: string;
  communitySlug: string;
  initialBattle: ArenaBattleView | null;
  initialProfile: ArenaGladiatorProfile | null;
  initialLeaderboard: ArenaLeaderboard;
  initialOccupationHub: ArenaOccupationHub;
  initialPvpHub: ArenaPvpHub | null;
  initialSection?: ArenaSection;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [battle, setBattle] = useState(initialBattle);
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard);
  const [occupationHub, setOccupationHub] = useState(initialOccupationHub);
  const [pvpHub, setPvpHub] = useState(initialPvpHub);
  const [editing, setEditing] = useState(false);
  const [screen, setScreen] = useState<"VILLAGE" | "BATTLE">(
    initialBattle && initialSection === "VILLAGE" ? "BATTLE" : "VILLAGE",
  );
  const formKey = useMemo(() => `${profile?.updatedAt ?? "new"}-${editing}`, [editing, profile]);

  async function refreshArenaData() {
    const [profileResponse, leaderboardResponse, occupationResponse] = await Promise.all([
      fetch(`/api/communities/${communityId}/games/arena/gladiator`),
      fetch(`/api/communities/${communityId}/games/arena/leaderboard`),
      fetch(`/api/communities/${communityId}/games/arena/occupations`),
    ]);
    const profilePayload = (await profileResponse.json()) as { gladiator?: ArenaGladiatorProfile };
    const leaderboardPayload = (await leaderboardResponse.json()) as {
      leaderboard?: ArenaLeaderboard;
    };
    const occupationPayload = (await occupationResponse.json()) as { hub?: ArenaOccupationHub };
    if (profileResponse.ok && profilePayload.gladiator) setProfile(profilePayload.gladiator);
    if (leaderboardResponse.ok && leaderboardPayload.leaderboard)
      setLeaderboard(leaderboardPayload.leaderboard);
    if (occupationResponse.ok && occupationPayload.hub) setOccupationHub(occupationPayload.hub);
  }

  if (!profile || editing)
    return (
      <>
        <Link className="back-link" href={`/app/${communitySlug}/games`}>
          ← Voltar aos jogos
        </Link>
        <GladiatorForm
          communityId={communityId}
          key={formKey}
          onCancel={profile ? () => setEditing(false) : undefined}
          onSaved={(saved) => {
            setProfile(saved);
            setEditing(false);
            void refreshArenaData();
          }}
          profile={profile}
        />
      </>
    );

  if (screen === "BATTLE")
    return (
      <ArenaBattle
        battle={battle}
        campaignStep={profile.campaign.step}
        communityId={communityId}
        league={profile.campaign.league}
        opponents={profile.campaign.opponents}
        previousLeague={profile.campaign.previousLeague}
        onBack={() => setScreen("VILLAGE")}
        onBattleChange={setBattle}
        onFinished={refreshArenaData}
      />
    );

  return (
    <Village
      communityId={communityId}
      communitySlug={communitySlug}
      hasActiveBattle={battle?.status === "ACTIVE"}
      leaderboard={leaderboard}
      occupationHub={occupationHub}
      onDeleted={() => {
        setLeaderboard((current) => current.filter((entry) => entry.id !== profile.id));
        setBattle(null);
        setProfile(null);
        setScreen("VILLAGE");
      }}
      onArena={() => setScreen("BATTLE")}
      onEdit={() => setEditing(true)}
      onOccupationHubChange={setOccupationHub}
      onOccupationSettled={refreshArenaData}
      onPvpHubChange={setPvpHub}
      onProfileChange={setProfile}
      profile={profile}
      pvpHub={pvpHub}
      section={initialSection}
    />
  );
}
