import type { MdRuntime, QueryOptions } from '@agentshouse/mdruntime';
import { fieldStyles } from './theme.js';
import { mdTypes } from './runtime.js';

export type FieldDefinition = {
  kind: string;
  required?: boolean;
  values?: readonly string[];
  to?: string;
  of?: string;
};
const configure = Symbol('configure');
export type FieldValidity = { valid: boolean; message: string };
export type FieldChange = { value: unknown; validity: FieldValidity };

export abstract class FieldControl extends HTMLElement {
  static observedAttributes = ['label', 'disabled'];
  protected abstract readonly kind: string;
  protected definition: FieldDefinition | undefined;
  protected currentValue: unknown;
  protected fieldName = '';
  protected runtime: MdRuntime | undefined;
  protected room = '';
  protected readonly root = this.attachShadow({ mode: 'open' });
  protected get label(): string {
    return this.getAttribute('label') ?? this.fieldName;
  }

  get value(): unknown {
    return structuredClone(this.currentValue);
  }
  set value(value: unknown) {
    this.currentValue = structuredClone(value);
    this.writeValue();
    this.presentValidity();
  }

  abstract get validity(): FieldValidity;

  bind(runtime: MdRuntime, room: string, type: string, field: string): void {
    const definition = mdTypes(runtime.types(room)).find((entry) => entry.name === type)?.fields[
      field
    ] as FieldDefinition | undefined;
    this[configure](runtime, room, field, definition);
  }

  [configure](
    runtime: MdRuntime,
    room: string,
    field: string,
    definition: FieldDefinition | undefined,
  ): void {
    if (!definition || definition.kind !== this.kind)
      throw new TypeError(`The ${field} field must have kind ${this.kind}.`);
    this.definition = definition;
    this.fieldName = field;
    this.runtime = runtime;
    this.room = room;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }
  override focus(options?: FocusOptions): void {
    this.root.querySelector<HTMLElement>('input, textarea, select, button')?.focus(options);
  }
  abstract attributeChangedCallback(): void;
  protected abstract render(): void;
  protected abstract writeValue(): void;
  protected abstract presentValidity(): void;
  protected requiredMessage(): string {
    if (!this.definition) return 'Choose a field from an MD Type.';
    return this.currentValue === undefined && this.definition.required
      ? 'This field is required.'
      : '';
  }
  protected emitChange(): void {
    this.dispatchEvent(
      new CustomEvent<FieldChange>('change', {
        bubbles: true,
        composed: true,
        detail: { value: this.value, validity: this.validity },
      }),
    );
  }
}

abstract class ScalarField extends FieldControl {
  protected control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | undefined;
  private readonly caption = document.createElement('label');
  private readonly message = document.createElement('p');
  private readonly formatted = document.createElement('p');

  get validity(): FieldValidity {
    let message = this.requiredMessage();
    if (!message && this.control?.validity.badInput) message = this.inputMessage;
    if (!message && this.currentValue !== undefined) message = this.valueMessage();
    return { valid: message === '', message };
  }
  attributeChangedCallback(): void {
    this.caption.textContent = this.label;
    if (this.control) this.control.disabled = this.hasAttribute('disabled');
  }

  protected render(): void {
    const style = document.createElement('style');
    style.textContent = fieldStyles;
    this.control = this.createControl();
    this.control.id = 'value';
    this.control.lang = navigator.language;
    this.control.setAttribute('aria-describedby', 'message');
    this.caption.htmlFor = 'value';
    this.message.id = 'message';
    this.message.className = 'error';
    this.message.setAttribute('role', 'status');
    this.control.addEventListener('input', () => {
      this.currentValue = this.readValue();
      this.presentValidity();
    });
    this.control.addEventListener('change', (event) => {
      event.stopPropagation();
      this.emitChange();
    });
    this.formatted.setAttribute('aria-live', 'polite');
    this.root.replaceChildren(style, this.caption, this.control, this.formatted, this.message);
    this.attributeChangedCallback();
    this.writeValue();
    this.presentValidity();
  }

  protected writeValue(): void {
    if (this.control)
      this.control.value = this.currentValue === undefined ? '' : String(this.currentValue);
  }

  protected get inputMessage(): string {
    return 'Enter text.';
  }
  protected createControl(): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
    const input = document.createElement('textarea');
    input.rows = 2;
    return input;
  }
  protected readValue(): unknown {
    return this.control!.value;
  }
  protected valueMessage(): string {
    return typeof this.currentValue === 'string' ? '' : this.inputMessage;
  }
  protected formattedValue(): string {
    return '';
  }

  protected presentValidity(): void {
    const { valid, message } = this.validity;
    this.message.textContent = message;
    this.control?.setAttribute('aria-invalid', String(!valid));
    this.control?.setCustomValidity(message);
    this.formatted.textContent =
      valid && this.currentValue !== undefined ? this.formattedValue() : '';
  }
}

export class StringField extends ScalarField {
  protected readonly kind = 'string';
}
export class NumberField extends ScalarField {
  protected override readonly kind = 'number';
  protected override get inputMessage(): string {
    return 'Enter a number.';
  }
  protected override createControl(): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    return input;
  }
  protected override readValue(): unknown {
    return this.control!.value === ''
      ? undefined
      : (this.control as HTMLInputElement).valueAsNumber;
  }
  protected override valueMessage(): string {
    return typeof this.currentValue === 'number' && Number.isFinite(this.currentValue)
      ? ''
      : this.inputMessage;
  }
  protected override formattedValue(): string {
    return new Intl.NumberFormat(navigator.language, { maximumSignificantDigits: 21 }).format(
      this.currentValue as number,
    );
  }
}
export class DateField extends ScalarField {
  protected override readonly kind = 'date';
  protected override get inputMessage(): string {
    return 'Choose a valid date.';
  }
  protected override createControl(): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'date';
    return input;
  }
  protected override readValue(): unknown {
    return this.control!.value || undefined;
  }
  protected override valueMessage(): string {
    return typeof this.currentValue === 'string' &&
      this.control?.value === this.currentValue &&
      this.currentValue !== ''
      ? ''
      : this.inputMessage;
  }
  protected override formattedValue(): string {
    return new Intl.DateTimeFormat(navigator.language, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format((this.control as HTMLInputElement).valueAsDate!);
  }
}
export class EnumField extends ScalarField {
  protected override readonly kind: string = 'enum';
  protected override get inputMessage(): string {
    return 'Choose an available value.';
  }
  protected choices(): readonly string[] {
    return this.definition!.values!;
  }
  protected override createControl(): HTMLSelectElement {
    return document.createElement('select');
  }
  protected override readValue(): unknown {
    return this.control!.value || undefined;
  }
  protected override valueMessage(): string {
    return typeof this.currentValue === 'string' && this.choices().includes(this.currentValue)
      ? ''
      : this.inputMessage;
  }
  protected override writeValue(): void {
    if (!this.control || !this.definition) return;
    const choices = this.choices();
    this.control.replaceChildren(
      new Option('Choose a value', ''),
      ...choices.map((value) => new Option(value, value)),
    );
    if (this.currentValue !== undefined && !choices.includes(this.currentValue as string)) {
      const unavailable = new Option(
        `Unavailable: ${String(this.currentValue)}`,
        String(this.currentValue),
      );
      unavailable.disabled = true;
      this.control.append(unavailable);
    }
    super.writeValue();
  }
}
export class ListField extends FieldControl {
  protected readonly kind = 'list';
  private readonly group = document.createElement('fieldset');
  private readonly legend = document.createElement('legend');
  private readonly message = document.createElement('p');
  private readonly add = document.createElement('button');
  private items: FieldControl[] = [];

  get validity(): FieldValidity {
    let message = this.requiredMessage();
    if (!message && this.currentValue !== undefined) {
      if (!Array.isArray(this.currentValue)) message = 'Enter a list.';
      else if (this.items.some((item) => !item.validity.valid)) message = 'Complete each item.';
    }
    return { valid: message === '', message };
  }

  override focus(options?: FocusOptions): void {
    (this.items[0] ?? this.add).focus(options);
  }
  attributeChangedCallback(): void {
    this.legend.textContent = this.label;
    const disabled = this.hasAttribute('disabled');
    this.group.disabled = disabled;
    for (const [index, item] of this.items.entries()) {
      item.setAttribute('label', `${this.label} ${index + 1}`);
      item.toggleAttribute('disabled', disabled);
    }
  }

  protected render(): void {
    const style = document.createElement('style');
    style.textContent = fieldStyles;
    this.message.className = 'error';
    this.message.id = 'message';
    this.message.setAttribute('role', 'status');
    this.group.setAttribute('aria-describedby', 'message');
    this.add.type = 'button';
    this.add.textContent = 'Add item';
    this.add.onclick = () => {
      this.currentValue = [
        ...(Array.isArray(this.currentValue) ? this.currentValue : []),
        this.definition!.of === 'string' ? '' : undefined,
      ];
      this.writeValue();
      this.presentValidity();
      this.items.at(-1)!.focus();
      this.emitChange();
    };
    this.root.replaceChildren(style, this.group, this.message);
    this.writeValue();
    this.presentValidity();
  }

  protected writeValue(): void {
    this.items = [];
    this.group.replaceChildren(this.legend);
    if (this.definition && Array.isArray(this.currentValue)) {
      for (const [index, value] of this.currentValue.entries()) {
        const item = document.createElement(`md-${this.definition.of}-field`) as FieldControl;
        item[configure](this.runtime!, this.room, this.fieldName, {
          ...this.definition,
          kind: this.definition.of!,
          required: true,
        });
        item.value = value;
        const row = document.createElement('div');
        row.className = 'item';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.setAttribute('aria-label', `Remove item ${index + 1}`);
        remove.onclick = () => {
          this.currentValue = this.items
            .filter((_, position) => position !== index)
            .map((entry) => entry.value);
          this.writeValue();
          this.presentValidity();
          (this.items[index] ?? this.add).focus();
          this.emitChange();
        };
        item.addEventListener('input', (event) => {
          event.stopPropagation();
          this.readItems();
        });
        item.addEventListener('change', (event) => {
          event.stopPropagation();
          this.readItems();
          this.emitChange();
        });
        this.items.push(item);
        row.append(item, remove);
        this.group.append(row);
      }
    }
    this.group.append(this.add);
    this.add.disabled = !this.definition;
    this.attributeChangedCallback();
  }

  protected presentValidity(): void {
    this.message.textContent = this.validity.message;
    this.group.setAttribute('aria-invalid', String(!this.validity.valid));
  }
  private readItems(): void {
    this.currentValue = this.items.map((item) => item.value);
    this.presentValidity();
  }
}
export class ReferenceField extends EnumField {
  protected override readonly kind = 'reference';
  private unobserve: (() => void) | undefined;
  override bind(runtime: MdRuntime, room: string, type: string, field: string): void {
    super.bind(runtime, room, type, field);
    this.watch();
  }
  override connectedCallback(): void {
    super.connectedCallback();
    this.watch();
  }
  disconnectedCallback(): void {
    this.unobserve?.();
    this.unobserve = undefined;
  }
  protected override choices(): readonly string[] {
    return this.runtime!.query(this.queryOptions()).documents.map((document) => document.path);
  }
  private queryOptions(): QueryOptions {
    return {
      selector: {
        room: this.room,
        ...(this.definition!.to === 'any' ? {} : { type: this.definition!.to }),
      },
      sort: { path: 1 },
    };
  }
  private watch(): void {
    this.unobserve?.();
    this.unobserve = undefined;
    if (this.isConnected && this.definition) {
      this.unobserve = this.runtime!.observe('query', this.queryOptions(), () => {
        this.writeValue();
        this.presentValidity();
      });
    }
  }
}
customElements.define('md-string-field', StringField);
customElements.define('md-number-field', NumberField);
customElements.define('md-date-field', DateField);
customElements.define('md-enum-field', EnumField);
customElements.define('md-reference-field', ReferenceField);
customElements.define('md-list-field', ListField);
