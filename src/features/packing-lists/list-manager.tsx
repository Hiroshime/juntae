"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { packingItemSchema, type PackingItemInput } from "@/lib/validation/packing-list";
import type { PackingListDetail } from "@/server/services/packing-list-service";
import { PackingListForm } from "./list-form";
import { packingListRequest } from "./request";

type Item = PackingListDetail["items"][number];
type Member = { id: string; name: string };

function ItemForm({
  item,
  members,
  currentUserId,
  canManage,
  pending,
  onSave,
  onCancel,
}: {
  item?: Item;
  members: Member[];
  currentUserId: string;
  canManage: boolean;
  pending: boolean;
  onSave: (input: PackingItemInput) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [responsible, setResponsible] = useState(item?.responsibleUserId || "");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const parsed = packingItemSchema.safeParse({
      ...Object.fromEntries(form),
      responsibleUserId: responsible,
      responsibleLabel: responsible ? form.get("responsibleLabel") : null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Confira os campos.");
      return;
    }
    setError("");
    if ((await onSave(parsed.data)) && !item) {
      formElement.reset();
      setResponsible("");
    }
  }
  return (
    <form
      className="form"
      onSubmit={submit}
      aria-label={item ? `Editar ${item.name}` : "Adicionar item"}
    >
      <fieldset className="packing-fields" disabled={pending}>
        <div className="form-row">
          <div className="field">
            <label htmlFor={`item-name-${item?.id || "new"}`}>Item</label>
            <input
              id={`item-name-${item?.id || "new"}`}
              name="name"
              required
              maxLength={160}
              defaultValue={item?.name}
              placeholder="Café, pão, gelo, churrasqueira…"
            />
          </div>
          <div className="field">
            <label htmlFor={`item-quantity-${item?.id || "new"}`}>Quantidade (opcional)</label>
            <input
              id={`item-quantity-${item?.id || "new"}`}
              name="quantity"
              maxLength={100}
              defaultValue={item?.quantity || ""}
              placeholder="2 litros, 1 pacote…"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`item-person-${item?.id || "new"}`}>Responsável</label>
          <select
            id={`item-person-${item?.id || "new"}`}
            value={responsible}
            onChange={(event) => setResponsible(event.target.value)}
          >
            <option value="">A combinar</option>
            {members
              .filter((member) => canManage || member.id === currentUserId)
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                  {member.id === currentUserId ? " (eu)" : ""}
                </option>
              ))}
            {item?.responsibleUserId && !members.some((m) => m.id === item.responsibleUserId) && (
              <option value={item.responsibleUserId}>
                {item.responsibleName} (saiu da comunidade)
              </option>
            )}
          </select>
        </div>
        {responsible && (
          <div className="field">
            <label htmlFor={`item-label-${item?.id || "new"}`}>
              Nome do casal ou grupo (opcional)
            </label>
            <input
              id={`item-label-${item?.id || "new"}`}
              name="responsibleLabel"
              maxLength={160}
              defaultValue={item?.responsibleLabel || ""}
              placeholder="Luiz e Ana"
            />
            <p className="field-help">
              A pessoa selecionada fica como contato e pode cuidar deste item.
            </p>
          </div>
        )}
        <div className="field">
          <label htmlFor={`item-note-${item?.id || "new"}`}>Observação (opcional)</label>
          <input
            id={`item-note-${item?.id || "new"}`}
            name="note"
            maxLength={500}
            defaultValue={item?.note || ""}
            placeholder="Sem açúcar, levar gelado…"
          />
        </div>
        <div className="packing-actions">
          <button className="button" type="submit">
            {pending ? "Salvando…" : item ? "Salvar item" : "Adicionar item"}
          </button>
          {onCancel && (
            <button className="button ghost" type="button" onClick={onCancel}>
              Cancelar
            </button>
          )}
        </div>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function PackingListManager({
  list,
  communityId,
  communitySlug,
  currentUserId,
  members,
  events,
}: {
  list: PackingListDetail;
  communityId: string;
  communitySlug: string;
  currentUserId: string;
  members: Member[];
  events: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [view, setView] = useState("items");
  const pending = saving || refreshing;
  const base = `/api/communities/${communityId}/packing-lists/${list.id}`;
  async function mutate(path: string, method: string, body?: unknown) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await packingListRequest(`${base}${path}`, method, body);
      setMessage("Lista atualizada.");
      setEditing(null);
      startTransition(() => router.refresh());
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a lista.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  const assigned = list.items.filter((item) => item.responsibleUserId).length;
  const delivered = list.items.filter((item) => item.delivered).length;
  const groups = new Map<string, { title: string; items: Item[] }>();
  for (const item of list.items) {
    const key =
      view === "items"
        ? "all"
        : `${item.responsibleUserId || "free"}:${item.responsibleLabel || ""}`;
    if (!groups.has(key))
      groups.set(key, {
        title:
          view === "items"
            ? "Itens da lista"
            : item.responsibleLabel || item.responsibleName || "A combinar",
        items: [],
      });
    groups.get(key)!.items.push(item);
  }
  return (
    <div className="packing-manager">
      <div className="card packing-summary">
        <p>
          <strong>{list.items.length}</strong> itens · <strong>{assigned}</strong> com responsável ·{" "}
          <strong>{list.items.length - assigned}</strong> a combinar · <strong>{delivered}</strong>{" "}
          levados
        </p>
        {list.canManage && (
          <div className="packing-actions">
            {!list.closed && (
              <button
                className="button secondary"
                type="button"
                disabled={pending}
                onClick={() => setSettings(!settings)}
              >
                {settings ? "Ocultar edição" : "Editar lista"}
              </button>
            )}
            <button
              className="button secondary"
              type="button"
              disabled={pending}
              onClick={() => {
                setSettings(false);
                void mutate("/status", "PUT", { closed: !list.closed });
              }}
            >
              {list.closed ? "Reabrir lista" : "Fechar lista"}
            </button>
          </div>
        )}
      </div>
      {list.closed && (
        <p className="notice">
          Lista fechada para alterações. Os itens e responsáveis continuam disponíveis para
          consulta.
        </p>
      )}
      {settings && !list.closed && (
        <section className="card">
          <h2>Editar lista</h2>
          <PackingListForm
            communityId={communityId}
            communitySlug={communitySlug}
            events={events}
            list={list}
            onSaved={() => setSettings(false)}
          />
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="small muted" role="status" aria-live="polite">
        {message}
      </p>
      <div className="grid packing-layout">
        {!list.closed && (
          <section className="card packing-add">
            <h2>Adicionar item</h2>
            <p className="muted small">Cadastre o que falta ou o que você vai levar.</p>
            <ItemForm
              members={members}
              currentUserId={currentUserId}
              canManage={list.canManage}
              pending={pending}
              onSave={(input) => mutate("/items", "POST", input)}
            />
          </section>
        )}
        <section className="packing-items">
          <div className="field packing-view">
            <label htmlFor="packing-view">Visualização</label>
            <select
              id="packing-view"
              value={view}
              onChange={(event) => setView(event.target.value)}
            >
              <option value="items">Por item</option>
              <option value="people">Por responsável</option>
            </select>
          </div>
          {!list.items.length && (
            <div className="card empty-state compact">
              <h2>O que vamos levar?</h2>
              <p>Adicione o primeiro item para combinar com a turma.</p>
            </div>
          )}
          {Array.from(groups, ([key, group]) => (
            <section key={key} className="packing-group">
              <h2>{group.title}</h2>
              {group.items.map((item) => (
                <article
                  className={`card packing-item${item.delivered ? " packing-delivered" : ""}`}
                  key={item.id}
                  aria-label={`Item ${item.name}`}
                >
                  {editing === item.id && !list.closed ? (
                    <ItemForm
                      item={item}
                      members={members}
                      currentUserId={currentUserId}
                      canManage={list.canManage}
                      pending={pending}
                      onSave={(input) => mutate(`/items/${item.id}`, "PUT", input)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <>
                      <div className="card-header">
                        <h3>{item.name}</h3>
                        <span className={`status-dot ${item.delivered ? "active" : "inactive"}`}>
                          {item.delivered
                            ? "Levado"
                            : item.responsibleUserId
                              ? "Combinado"
                              : "A combinar"}
                        </span>
                      </div>
                      {item.quantity && <p className="packing-quantity">{item.quantity}</p>}
                      <p className="packing-responsible">
                        <strong>
                          {item.responsibleLabel || item.responsibleName || "Sem responsável"}
                        </strong>
                        {item.responsibleLabel && (
                          <span className="small muted"> · contato: {item.responsibleName}</span>
                        )}
                        {item.responsibleUserId && !item.responsibleIsMember && (
                          <span className="small muted"> · saiu da comunidade</span>
                        )}
                      </p>
                      {item.note && <p className="muted packing-note">{item.note}</p>}
                      {!list.closed && (
                        <div className="packing-actions">
                          {!item.responsibleUserId && (
                            <button
                              className="button"
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                void mutate(`/items/${item.id}`, "PATCH", { action: "claim" })
                              }
                            >
                              Eu levo
                            </button>
                          )}
                          {item.responsibleUserId && (item.mine || list.canManage) && (
                            <>
                              <button
                                className="button secondary"
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  void mutate(`/items/${item.id}`, "PATCH", {
                                    action: "delivered",
                                    delivered: !item.delivered,
                                  })
                                }
                              >
                                {item.delivered ? "Marcar como pendente" : "Marcar como levado"}
                              </button>
                              <button
                                className="button ghost"
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  void mutate(`/items/${item.id}`, "PATCH", { action: "release" })
                                }
                              >
                                Liberar item
                              </button>
                            </>
                          )}
                          {item.canEdit && (
                            <>
                              <button
                                className="button ghost"
                                type="button"
                                disabled={pending}
                                onClick={() => setEditing(item.id)}
                              >
                                Editar item
                              </button>
                              <button
                                className="button ghost"
                                type="button"
                                disabled={pending}
                                onClick={() => {
                                  if (window.confirm(`Remover “${item.name}” da lista?`))
                                    void mutate(`/items/${item.id}`, "DELETE");
                                }}
                              >
                                Remover item
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </article>
              ))}
            </section>
          ))}
        </section>
      </div>
    </div>
  );
}
