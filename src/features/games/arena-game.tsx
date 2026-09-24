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
  ARENA_PRONOUNS,
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
import type { ArenaGladiatorProfile } from "@/server/services/arena-service";
import { ArenaAvatar } from "./arena-avatar";

type IdentityDraft = {
  name: string;
  pronouns: (typeof ARENA_PRONOUNS)[number]["id"];
  origin: (typeof ARENA_ORIGINS)[number]["id"];
  entryLine: string;
  victoryLine: string;
  appearance: ArenaAppearance;
};

function identityFromProfile(profile: ArenaGladiatorProfile | null): IdentityDraft {
  return profile
    ? {
        name: profile.name,
        pronouns: profile.pronouns as IdentityDraft["pronouns"],
        origin: profile.origin as IdentityDraft["origin"],
        entryLine: profile.entryLine ?? "",
        victoryLine: profile.victoryLine ?? "",
        appearance: profile.appearance,
      }
    : {
        name: "",
        pronouns: "ELE_DELE",
        origin: "PORTOS_AMBAR",
        entryLine: "",
        victoryLine: "",
        appearance: DEFAULT_ARENA_APPEARANCE,
      };
}

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
            <ChoiceSelect
              id="arena-pronouns"
              label="Pronomes"
              onChange={(pronouns) => setDraft({ ...draft, pronouns })}
              options={ARENA_PRONOUNS}
              value={draft.pronouns}
            />
            <label className="arena-full-field" htmlFor="arena-origin">
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
  onEdit,
  communitySlug,
}: {
  profile: ArenaGladiatorProfile;
  onEdit: () => void;
  communitySlug: string;
}) {
  const originLabel = arenaOptionLabel(ARENA_ORIGINS, profile.origin);
  const pronounsLabel = arenaOptionLabel(ARENA_PRONOUNS, profile.pronouns);
  const derivedEntries = [
    ["Vida", profile.derived.maxHealth],
    ["Energia", profile.derived.maxEnergy],
    ["Dano base", profile.derived.baseDamage],
    ["Precisão", `${profile.derived.accuracy}%`],
    ["Esquiva", `${profile.derived.evasion}%`],
    ["Guarda", profile.derived.guard],
  ];

  return (
    <div className="arena-village">
      <Link className="back-link" href={`/app/${communitySlug}/games`}>
        ← Voltar aos jogos
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
            O ferreiro aquece a forja, os portões da arena ainda estão sendo preparados e sua
            história acaba de começar.
          </p>
          <div className="arena-village-currencies" aria-label="Recursos do gladiador">
            <span>◈ {profile.gold.toLocaleString("pt-BR")} moedas</span>
            <span>★ {profile.fame} fama</span>
            <span>Nível {profile.level}</span>
          </div>
        </div>
      </header>

      <div className="arena-village-layout">
        <aside className="card arena-profile-card">
          <ArenaAvatar appearance={profile.appearance} compact name={profile.name} />
          <div className="arena-profile-title">
            <div>
              <span className="muted small">{pronounsLabel}</span>
              <h2>{profile.name}</h2>
              <p>{originLabel}</p>
            </div>
            <button className="button secondary compact" onClick={onEdit} type="button">
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
          <section className="arena-location-grid" aria-label="Locais da vila">
            <article className="arena-location-card forge">
              <span className="arena-location-icon" aria-hidden="true">
                ⚒
              </span>
              <div>
                <div className="eyebrow">Forja da Aurora</div>
                <h2>Ferreiro de armas</h2>
                <p>Espadas, machados e martelos chegarão com a economia da Fase 3.</p>
              </div>
              <span className="arena-coming-label">Em preparação</span>
            </article>
            <article className="arena-location-card armoury">
              <span className="arena-location-icon" aria-hidden="true">
                ◒
              </span>
              <div>
                <div className="eyebrow">Bastião de Bronze</div>
                <h2>Armeiro</h2>
                <p>Capacetes, escudos e armaduras serão exibidos diretamente no gladiador.</p>
              </div>
              <span className="arena-coming-label">Em preparação</span>
            </article>
            <article className="arena-location-card trainer">
              <span className="arena-location-icon" aria-hidden="true">
                ◎
              </span>
              <div>
                <div className="eyebrow">Pátio de treino</div>
                <h2>Treinador</h2>
                <p>Na próxima fase, conheça movimentos, alcance, energia e estilos de ataque.</p>
              </div>
              <span className="arena-coming-label">Próxima fase</span>
            </article>
            <article className="arena-location-card gates">
              <span className="arena-location-icon" aria-hidden="true">
                ♜
              </span>
              <div>
                <div className="eyebrow">Portões do Coliseu</div>
                <h2>Arena de combate</h2>
                <p>
                  O primeiro duelo 2D contra um adversário controlado pela arena chegará na Fase 2.
                </p>
              </div>
              <span className="arena-coming-label">Portões fechados</span>
            </article>
          </section>

          <div className="arena-sheet-grid">
            <section className="card arena-stats-card">
              <div className="card-header">
                <div>
                  <div className="eyebrow">Construção</div>
                  <h2>Atributos</h2>
                </div>
                <span className="pill">Nível {profile.level}</span>
              </div>
              <div className="arena-attribute-sheet">
                {ARENA_ATTRIBUTE_DETAILS.map((attribute) => (
                  <div key={attribute.key}>
                    <span>{attribute.shortLabel}</span>
                    <strong>{profile.attributes[attribute.key]}</strong>
                    <small>{attribute.label}</small>
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

            <section className="card arena-inventory-card">
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
                    Você começa apenas com coragem e 500 moedas. As compras serão abertas junto dos
                    comerciantes.
                  </p>
                </div>
              ) : (
                <ul>
                  {profile.inventory.map((item) => (
                    <li key={item.id}>{item.catalogItemKey}</li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ArenaGame({
  communityId,
  communitySlug,
  initialProfile,
}: {
  communityId: string;
  communitySlug: string;
  initialProfile: ArenaGladiatorProfile | null;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [editing, setEditing] = useState(false);
  const formKey = useMemo(() => `${profile?.updatedAt ?? "new"}-${editing}`, [editing, profile]);

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
          }}
          profile={profile}
        />
      </>
    );

  return (
    <Village communitySlug={communitySlug} onEdit={() => setEditing(true)} profile={profile} />
  );
}
