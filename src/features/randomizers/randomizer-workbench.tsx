"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ShareActions } from "@/components/share-actions";
import {
  formatRandomizerResultText,
  randomizerPresetDescriptions,
  randomizerPresetLabels,
} from "@/features/randomizers/randomizer-labels";
import { RandomizerResultView } from "@/features/randomizers/randomizer-result";
import {
  randomizerPresetTypes,
  type RandomizerEntry,
  type RandomizerPresetType,
  type RandomizerRequest,
  type RandomizerResult,
} from "@/lib/randomizer";

type SourceMember = RandomizerEntry & { avatarUrl: string | null };
type SourceEvent = {
  id: string;
  title: string;
  startsAt: string;
  participants: Array<SourceMember & { status: "GOING" | "MAYBE" | "NOT_GOING" }>;
};
type SavedRun = {
  id: string;
  presetType: RandomizerPresetType;
  title: string | null;
  createdAt: string;
  createdBy: { name: string };
};
type Pair = [string, string];
type ParticipantSource = "MEMBERS" | "EVENT_GOING" | "EVENT_GOING_MAYBE" | "MANUAL";

function linesToEntries(value: string, prefix: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label, index) => ({ id: `${prefix}-${index}`, label }));
}

function driversFromText(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [rawLabel, rawCapacity] = line.split("|");
      return {
        id: `driver-${index}`,
        label: rawLabel?.trim() ?? "",
        capacity: Number(rawCapacity?.trim()),
      };
    });
}

function RelationEditor({
  label,
  help,
  pairs,
  participants,
  onChange,
}: {
  label: string;
  help: string;
  pairs: Pair[];
  participants: RandomizerEntry[];
  onChange: (pairs: Pair[]) => void;
}) {
  function update(index: number, position: 0 | 1, value: string) {
    onChange(
      pairs.map((pair, pairIndex) => {
        if (pairIndex !== index) return pair;
        const next: Pair = [...pair];
        next[position] = value;
        return next;
      }),
    );
  }

  return (
    <div className="randomizer-relation-editor">
      <div>
        <strong>{label}</strong>
        <p className="muted small">{help}</p>
      </div>
      {pairs.map((pair, index) => (
        <div className="randomizer-relation-row" key={`${label}-${index}`}>
          <select
            aria-label={`${label}: primeira pessoa ${index + 1}`}
            onChange={(event) => update(index, 0, event.target.value)}
            value={pair[0]}
          >
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.label}
              </option>
            ))}
          </select>
          <select
            aria-label={`${label}: segunda pessoa ${index + 1}`}
            onChange={(event) => update(index, 1, event.target.value)}
            value={pair[1]}
          >
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.label}
              </option>
            ))}
          </select>
          <button
            aria-label={`Remover regra ${label.toLocaleLowerCase("pt-BR")} ${index + 1}`}
            className="button ghost"
            onClick={() => onChange(pairs.filter((_, pairIndex) => pairIndex !== index))}
            type="button"
          >
            Remover
          </button>
        </div>
      ))}
      <button
        className="button secondary"
        disabled={participants.length < 2}
        onClick={() => onChange([...pairs, [participants[0].id, participants[1].id]])}
        type="button"
      >
        + Adicionar regra
      </button>
    </div>
  );
}

export function RandomizerWorkbench({
  communityId,
  communitySlug,
  members,
  events,
  savedRuns,
}: {
  communityId: string;
  communitySlug: string;
  members: SourceMember[];
  events: SourceEvent[];
  savedRuns: SavedRun[];
}) {
  const router = useRouter();
  const [presetType, setPresetType] = useState<RandomizerPresetType>("TEAMS");
  const [source, setSource] = useState<ParticipantSource>("MEMBERS");
  const [selectedMemberIds, setSelectedMemberIds] = useState(() =>
    members.map((member) => member.id),
  );
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [manualNames, setManualNames] = useState("");
  const [groupCount, setGroupCount] = useState(2);
  const [maxGroupSize, setMaxGroupSize] = useState(4);
  const [groupNames, setGroupNames] = useState("");
  const [drivers, setDrivers] = useState("João | 4\nMaria | 3");
  const [items, setItems] = useState("Pizza\nHambúrguer\nSushi\nLasanha");
  const [selectionCount, setSelectionCount] = useState(1);
  const [oddMode, setOddMode] = useState<"TRIO" | "UNPAIRED">("TRIO");
  const [together, setTogether] = useState<Pair[]>([]);
  const [separate, setSeparate] = useState<Pair[]>([]);
  const [captainIds, setCaptainIds] = useState<string[]>([]);
  const [result, setResult] = useState<RandomizerResult | null>(null);
  const [lastRequest, setLastRequest] = useState<RandomizerRequest | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const selectedEvent = events.find((event) => event.id === eventId);
  const participants = useMemo(() => {
    if (source === "MANUAL") return linesToEntries(manualNames, "manual");
    if (source === "MEMBERS") {
      const selected = new Set(selectedMemberIds);
      return members.filter((member) => selected.has(member.id));
    }
    const acceptedStatuses = source === "EVENT_GOING" ? ["GOING"] : ["GOING", "MAYBE"];
    return (selectedEvent?.participants ?? []).filter((participant) =>
      acceptedStatuses.includes(participant.status),
    );
  }, [manualNames, members, selectedEvent, selectedMemberIds, source]);

  function toggleMember(memberId: string) {
    setSelectedMemberIds((current) =>
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
    );
  }

  function buildRequest(): RandomizerRequest {
    const itemEntries = linesToEntries(items, "item");
    const configuration: RandomizerRequest["configuration"] = {};
    if (presetType === "TEAMS") {
      configuration.groupCount = groupCount;
      configuration.maxGroupSize = maxGroupSize;
      configuration.groupNames = groupNames
        .split("\n")
        .map((name) => name.trim())
        .filter(Boolean);
    } else if (presetType === "GROUPS") {
      configuration.maxGroupSize = maxGroupSize;
    } else if (presetType === "CARS") {
      configuration.drivers = driversFromText(drivers);
    } else if (presetType === "ASSIGN_ITEMS") {
      configuration.items = itemEntries;
      configuration.allowRepeatedItems = false;
    } else if (presetType === "PICK_PEOPLE") {
      configuration.count = selectionCount;
    } else if (presetType === "PICK_ITEM") {
      configuration.items = itemEntries;
      configuration.count = selectionCount;
    } else if (presetType === "PAIRS") {
      configuration.oddMode = oddMode;
    }
    const groupPreset = ["TEAMS", "GROUPS", "CARS", "PAIRS"].includes(presetType);
    const participantIds = new Set(participants.map((participant) => participant.id));
    return {
      presetType,
      participants: presetType === "PICK_ITEM" ? [] : participants,
      configuration,
      constraints: groupPreset
        ? {
            together: together.filter(
              ([first, second]) =>
                first !== second && participantIds.has(first) && participantIds.has(second),
            ),
            separate: separate.filter(
              ([first, second]) =>
                first !== second && participantIds.has(first) && participantIds.has(second),
            ),
            captainIds:
              presetType === "TEAMS"
                ? captainIds.filter((captainId) => participantIds.has(captainId))
                : [],
          }
        : {},
    };
  }

  async function generate() {
    setPending(true);
    setMessage(null);
    setSavedId(null);
    const request = buildRequest();
    const response = await fetch(`/api/communities/${communityId}/randomizers/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      result?: RandomizerResult;
    };
    setPending(false);
    if (!response.ok || !data.result) {
      setMessage({ kind: "error", text: data.error ?? "Não foi possível realizar o sorteio." });
      return;
    }
    setResult(data.result);
    setLastRequest(request);
    setTitle((current) => current || randomizerPresetLabels[presetType]);
    setMessage({ kind: "success", text: "Sorteio realizado com aleatoriedade segura." });
    window.setTimeout(() => document.querySelector("#randomizer-result")?.scrollIntoView(), 0);
  }

  async function save() {
    if (!result || !lastRequest) return;
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/communities/${communityId}/randomizers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim() || null, request: lastRequest, result }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      run?: { id: string };
    };
    setPending(false);
    if (!response.ok || !data.run) {
      setMessage({ kind: "error", text: data.error ?? "Não foi possível salvar o resultado." });
      return;
    }
    setSavedId(data.run.id);
    setMessage({ kind: "success", text: "Resultado salvo no histórico da comunidade." });
    router.refresh();
  }

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(formatRandomizerResultText(title, presetType, result));
      setMessage({ kind: "success", text: "Resultado copiado." });
    } catch {
      setMessage({ kind: "error", text: "Não foi possível copiar o resultado." });
    }
  }

  const usesParticipants = presetType !== "PICK_ITEM";
  const usesItems = presetType === "ASSIGN_ITEMS" || presetType === "PICK_ITEM";
  const supportsGroupRules = ["TEAMS", "GROUPS", "CARS", "PAIRS"].includes(presetType);

  return (
    <>
      <section className="randomizer-preset-grid" aria-label="Tipos de sorteio">
        {randomizerPresetTypes.map((preset) => (
          <button
            aria-pressed={presetType === preset}
            className={`card randomizer-preset ${presetType === preset ? "selected" : ""}`}
            key={preset}
            onClick={() => {
              setPresetType(preset);
              setResult(null);
              setMessage(null);
            }}
            type="button"
          >
            <span aria-hidden="true">{preset === "CARS" ? "🚗" : "🎲"}</span>
            <strong>{randomizerPresetLabels[preset]}</strong>
            <small>{randomizerPresetDescriptions[preset]}</small>
          </button>
        ))}
      </section>

      <div className="randomizer-builder-grid">
        {usesParticipants && (
          <section className="card randomizer-step" id="randomizer-participants">
            <div className="randomizer-step-number">1</div>
            <div className="card-header">
              <div>
                <h2>Participantes</h2>
                <p className="muted small">Escolha uma fonte ou digite nomes livres.</p>
              </div>
              <strong>{participants.length}</strong>
            </div>
            <div className="field">
              <label htmlFor="randomizer-source">Fonte</label>
              <select
                id="randomizer-source"
                onChange={(event) => {
                  setSource(event.target.value as ParticipantSource);
                  setTogether([]);
                  setSeparate([]);
                  setCaptainIds([]);
                }}
                value={source}
              >
                <option value="MEMBERS">Membros da comunidade</option>
                <option value="EVENT_GOING">Confirmados de um evento</option>
                <option value="EVENT_GOING_MAYBE">Confirmados + talvez de um evento</option>
                <option value="MANUAL">Lista digitada manualmente</option>
              </select>
            </div>
            {source === "MEMBERS" && (
              <fieldset className="randomizer-participant-picker">
                <legend className="sr-only">Selecionar membros</legend>
                {members.map((member) => (
                  <label key={member.id}>
                    <input
                      checked={selectedMemberIds.includes(member.id)}
                      onChange={() => toggleMember(member.id)}
                      type="checkbox"
                    />
                    <span>{member.label}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {(source === "EVENT_GOING" || source === "EVENT_GOING_MAYBE") && (
              <div className="field">
                <label htmlFor="randomizer-event">Evento</label>
                <select
                  id="randomizer-event"
                  onChange={(event) => {
                    setEventId(event.target.value);
                    setTogether([]);
                    setSeparate([]);
                    setCaptainIds([]);
                  }}
                  value={eventId}
                >
                  {!events.length && <option value="">Nenhum evento futuro</option>}
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title} · {new Date(event.startsAt).toLocaleDateString("pt-BR")}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {source === "MANUAL" && (
              <div className="field">
                <label htmlFor="randomizer-manual-names">Um nome por linha</label>
                <textarea
                  id="randomizer-manual-names"
                  onChange={(event) => setManualNames(event.target.value)}
                  placeholder={"Ana\nBruno\nCarlos\nAna"}
                  rows={8}
                  value={manualNames}
                />
                <span className="field-help">
                  Nomes repetidos continuam sendo pessoas distintas no sorteio.
                </span>
              </div>
            )}
          </section>
        )}

        <section className="card randomizer-step" id="randomizer-rules">
          <div className="randomizer-step-number">{usesParticipants ? "2" : "1"}</div>
          <div className="card-header">
            <div>
              <h2>Configuração</h2>
              <p className="muted small">{randomizerPresetDescriptions[presetType]}</p>
            </div>
          </div>
          {presetType === "TEAMS" && (
            <>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="randomizer-team-count">Quantidade de times</label>
                  <input
                    id="randomizer-team-count"
                    max={50}
                    min={1}
                    onChange={(event) => setGroupCount(Number(event.target.value))}
                    type="number"
                    value={groupCount}
                  />
                </div>
                <div className="field">
                  <label htmlFor="randomizer-team-size">Máximo por time</label>
                  <input
                    id="randomizer-team-size"
                    max={100}
                    min={1}
                    onChange={(event) => setMaxGroupSize(Number(event.target.value))}
                    type="number"
                    value={maxGroupSize}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="randomizer-team-names">Nomes dos times, um por linha</label>
                <textarea
                  id="randomizer-team-names"
                  onChange={(event) => setGroupNames(event.target.value)}
                  placeholder={"Time Roxo\nTime Laranja"}
                  rows={3}
                  value={groupNames}
                />
              </div>
            </>
          )}
          {presetType === "GROUPS" && (
            <div className="field">
              <label htmlFor="randomizer-group-size">Pessoas por grupo, no máximo</label>
              <input
                id="randomizer-group-size"
                max={100}
                min={1}
                onChange={(event) => setMaxGroupSize(Number(event.target.value))}
                type="number"
                value={maxGroupSize}
              />
            </div>
          )}
          {presetType === "CARS" && (
            <div className="field">
              <label htmlFor="randomizer-drivers">Motorista | vagas para passageiros</label>
              <textarea
                id="randomizer-drivers"
                onChange={(event) => setDrivers(event.target.value)}
                rows={6}
                value={drivers}
              />
              <span className="field-help">
                Exemplo: João | 4. O número significa vagas livres para passageiros.
              </span>
            </div>
          )}
          {usesItems && (
            <div className="field">
              <label htmlFor="randomizer-items">Itens, um por linha</label>
              <textarea
                id="randomizer-items"
                onChange={(event) => setItems(event.target.value)}
                placeholder={"Restaurante A\nRestaurante B"}
                rows={7}
                value={items}
              />
              {presetType === "ASSIGN_ITEMS" && (
                <span className="field-help">Cada item será usado no máximo uma vez.</span>
              )}
            </div>
          )}
          {(presetType === "PICK_PEOPLE" || presetType === "PICK_ITEM") && (
            <div className="field">
              <label htmlFor="randomizer-selection-count">Quantidade a escolher</label>
              <input
                id="randomizer-selection-count"
                max={200}
                min={1}
                onChange={(event) => setSelectionCount(Number(event.target.value))}
                type="number"
                value={selectionCount}
              />
            </div>
          )}
          {presetType === "PAIRS" && participants.length % 2 === 1 && (
            <fieldset className="randomizer-odd-choice">
              <legend>Total ímpar: o que fazer?</legend>
              <label>
                <input
                  checked={oddMode === "TRIO"}
                  name="odd-mode"
                  onChange={() => setOddMode("TRIO")}
                  type="radio"
                />
                Criar uma dupla e um trio
              </label>
              <label>
                <input
                  checked={oddMode === "UNPAIRED"}
                  name="odd-mode"
                  onChange={() => setOddMode("UNPAIRED")}
                  type="radio"
                />
                Deixar uma pessoa sem par
              </label>
            </fieldset>
          )}
          {supportsGroupRules && (
            <details className="randomizer-advanced">
              <summary>Regras opcionais avançadas</summary>
              <RelationEditor
                help="As duas pessoas serão alocadas no mesmo grupo."
                label="Manter juntas"
                onChange={setTogether}
                pairs={together}
                participants={participants}
              />
              <RelationEditor
                help="As duas pessoas nunca serão alocadas no mesmo grupo."
                label="Manter separadas"
                onChange={setSeparate}
                pairs={separate}
                participants={participants}
              />
              {presetType === "TEAMS" && (
                <fieldset className="randomizer-captains">
                  <legend>Capitães, no máximo um por time</legend>
                  {participants.map((participant) => (
                    <label key={participant.id}>
                      <input
                        checked={captainIds.includes(participant.id)}
                        onChange={() =>
                          setCaptainIds((current) =>
                            current.includes(participant.id)
                              ? current.filter((id) => id !== participant.id)
                              : [...current, participant.id],
                          )
                        }
                        type="checkbox"
                      />
                      {participant.label}
                    </label>
                  ))}
                </fieldset>
              )}
            </details>
          )}
          <button
            className="button randomizer-draw-button"
            disabled={pending}
            onClick={generate}
            type="button"
          >
            {pending ? "Sorteando…" : "🎲 Sortear agora"}
          </button>
          <p className="muted small randomizer-safety-note">
            Sorteio recreativo com aleatoriedade criptograficamente segura. Não use para apostas ou
            decisões de alto risco.
          </p>
        </section>
      </div>

      {message && (
        <div className={message.kind} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </div>
      )}

      {result && (
        <section className="card randomizer-result-card" id="randomizer-result">
          <div className="randomizer-result-celebration" aria-hidden="true">
            ✦ 🎲 ✦
          </div>
          <div className="card-header">
            <div>
              <div className="eyebrow">Resultado</div>
              <h2>{title || randomizerPresetLabels[presetType]}</h2>
            </div>
            <span className="role-badge">Aleatório</span>
          </div>
          <RandomizerResultView result={result} />
          <div className="field randomizer-title-field">
            <label htmlFor="randomizer-result-title">Nome para salvar</label>
            <input
              id="randomizer-result-title"
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </div>
          <div className="actions">
            <button className="button" disabled={pending} onClick={generate} type="button">
              Sortear novamente
            </button>
            <button className="button secondary" onClick={copyResult} type="button">
              Copiar resultado
            </button>
            <button
              className="button secondary"
              disabled={pending || !!savedId}
              onClick={save}
              type="button"
            >
              {savedId ? "Resultado salvo" : "Salvar resultado"}
            </button>
            <button
              className="button ghost"
              onClick={() => document.querySelector("#randomizer-participants")?.scrollIntoView()}
              type="button"
            >
              Editar participantes
            </button>
            <button
              className="button ghost"
              onClick={() => document.querySelector("#randomizer-rules")?.scrollIntoView()}
              type="button"
            >
              Editar regras
            </button>
          </div>
          <ShareActions
            path={
              savedId
                ? `/app/${communitySlug}/randomizers/${savedId}`
                : `/app/${communitySlug}/randomizers`
            }
            text={formatRandomizerResultText(title, presetType, result)}
            title={title || randomizerPresetLabels[presetType]}
          />
          {savedId && (
            <Link className="small" href={`/app/${communitySlug}/randomizers/${savedId}`}>
              Abrir página permanente do resultado →
            </Link>
          )}
        </section>
      )}

      <section className="randomizer-history" id="randomizer-history">
        <div className="card-header">
          <div>
            <div className="eyebrow">Histórico opcional</div>
            <h2>Resultados salvos</h2>
          </div>
          <span>{savedRuns.length}</span>
        </div>
        {savedRuns.length ? (
          <div className="randomizer-history-grid">
            {savedRuns.map((run) => (
              <Link
                className="card randomizer-history-card"
                href={`/app/${communitySlug}/randomizers/${run.id}`}
                key={run.id}
              >
                <span className="role-badge">{randomizerPresetLabels[run.presetType]}</span>
                <h3>{run.title || randomizerPresetLabels[run.presetType]}</h3>
                <p className="muted small">
                  {run.createdBy.name} · {new Date(run.createdAt).toLocaleString("pt-BR")}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card empty-state compact">
            <span className="empty-icon">🎲</span>
            <p>Resultados rápidos não são armazenados. Salve apenas o que quiser manter.</p>
          </div>
        )}
      </section>
    </>
  );
}
