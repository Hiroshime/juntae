"use client";

import { useRef } from "react";
import { PollOptionsEditor, emptyOption, type DraftOption } from "./poll-options-editor";

export type DraftQuestion = {
  key: number;
  title: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE";
  options: DraftOption[];
};
const emptyQuestion = (key: number): DraftQuestion => ({
  key,
  title: "",
  type: "SINGLE_CHOICE",
  options: [emptyOption(), emptyOption()],
});
export const initialQuestions = () => [emptyQuestion(0), emptyQuestion(1)];

export function PollQuestionsEditor({
  questions,
  onChange,
  albumBytes,
  setError,
}: {
  questions: DraftQuestion[];
  onChange: (questions: DraftQuestion[]) => void;
  albumBytes: number;
  setError: (message: string | null) => void;
}) {
  const nextKey = useRef(Math.max(...questions.map((question) => question.key)) + 1);
  function update(key: number, change: Partial<DraftQuestion>) {
    onChange(
      questions.map((question) => (question.key === key ? { ...question, ...change } : question)),
    );
  }
  return (
    <div className="poll-questions-editor">
      {questions.map((question, index) => (
        <fieldset className="poll-options-fieldset poll-question-editor" key={question.key}>
          <legend>Pergunta {index + 1}</legend>
          <div className="field">
            <label htmlFor={`question-title-${question.key}`}>Título da pergunta</label>
            <input
              id={`question-title-${question.key}`}
              required
              minLength={2}
              maxLength={160}
              value={question.title}
              onChange={(event) => update(question.key, { title: event.target.value })}
              placeholder={index === 0 ? "Almoço" : "Jantar"}
            />
          </div>
          <div className="field">
            <label htmlFor={`question-type-${question.key}`}>Como votar nesta pergunta</label>
            <select
              id={`question-type-${question.key}`}
              value={question.type}
              onChange={(event) =>
                update(question.key, { type: event.target.value as DraftQuestion["type"] })
              }
            >
              <option value="SINGLE_CHOICE">Escolher uma opção</option>
              <option value="MULTIPLE_CHOICE">Escolher várias opções</option>
            </select>
          </div>
          <PollOptionsEditor
            options={question.options}
            onChange={(options) => update(question.key, { options })}
            albumBytes={albumBytes}
            setError={setError}
            idPrefix={`question-${question.key}`}
          />
          {questions.length > 2 && (
            <button
              className="button ghost"
              type="button"
              onClick={() =>
                onChange(questions.filter((candidate) => candidate.key !== question.key))
              }
            >
              Remover pergunta {index + 1}
            </button>
          )}
        </fieldset>
      ))}
      {questions.length < 10 && (
        <button
          className="button secondary"
          type="button"
          onClick={() => onChange([...questions, emptyQuestion(nextKey.current++)])}
        >
          Adicionar pergunta
        </button>
      )}
      <p className="field-help">
        De 2 a 10 perguntas, com até 20 alternativas em cada uma. Cada resposta é registrada
        separadamente.
      </p>
    </div>
  );
}
