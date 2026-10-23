"use client";
// The drink list on the Settings page: one chip per drink (with a × to take
// it off) and a box + "Add" button for a new one, like the "Drink options"
// card in docs/designs/AdminSettings.html.
// Where it's used: src/app/admin/settings/page.tsx (inside the Settings form).
//
// The list is sent with the form as ONE hidden field, drink_options, holding
// a JSON list (e.g. ["Iced Matcha","Americano"]). saveSettings() passes it to
// admin_update_settings, which checks it again (1 to 12 drinks, each up to
// 40 characters, no repeats).
// Old bookings keep the drink they picked, even if it's taken off the list.
//
// "use client" = chips are added and taken off without saving yet.

import { Plus, X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FieldHelp, fieldBoxClasses } from "@/components/ui/field";

// The most drinks and the longest name (the same limits as the database).
const MAX_DRINKS = 12;
const MAX_LENGTH = 40;

// The drink list editor.
// Takes: the drinks saved now.
// Gives back: a fieldset with the chips, the add box and the hidden field.
export function DrinkOptionsField({ initial }: { initial: string[] }) {
  const [drinks, setDrinks] = useState(initial);
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState("");
  const inputId = useId();

  // Adds the typed drink to the list (if it's new and there's room).
  // Takes: nothing. Gives back: nothing.
  function addDrink() {
    const name = typed.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (drinks.some((drink) => drink.toLowerCase() === name.toLowerCase())) {
      setProblem(`"${name}" is already on the list.`);
      return;
    }
    if (drinks.length >= MAX_DRINKS) {
      setProblem(`The list can have at most ${MAX_DRINKS} drinks.`);
      return;
    }
    setDrinks([...drinks, name]);
    setTyped("");
    setProblem("");
  }

  // Pressing Enter in the box adds the drink instead of saving the whole form.
  // Takes: the key event. Gives back: nothing.
  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addDrink();
    }
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="sr-only">Drink options</legend>
      <input type="hidden" name="drink_options" value={JSON.stringify(drinks)} />

      {drinks.length === 0 ? (
        <p className="text-sm text-error">Add at least one drink.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {drinks.map((drink) => (
            <li
              key={drink}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-tan-soft/50 py-1 pl-3.5 pr-1 text-[13px]"
            >
              {drink}
              <button
                type="button"
                onClick={() => setDrinks(drinks.filter((other) => other !== drink))}
                aria-label={`Take ${drink} off the list`}
                className="flex size-9 items-center justify-center rounded-full text-brown hover:bg-white"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label htmlFor={inputId} className="sr-only">
          New drink option
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={handleKey}
            maxLength={MAX_LENGTH}
            placeholder="Add a drink option"
            aria-describedby={problem ? `${inputId}-help` : undefined}
            className={fieldBoxClasses(Boolean(problem))}
          />
          <Button variant="secondary" onClick={addDrink} className="shrink-0">
            <Plus aria-hidden="true" className="size-4" />
            Add
          </Button>
        </div>
        <FieldHelp id={`${inputId}-help`} error={problem} hint="Saved when you press Save changes." />
      </div>
    </fieldset>
  );
}
