import { adopt, fieldStyles } from './theme.js';
import { mdTypes, observation } from './runtime.js';
const configure = Symbol('configure');
export class FieldControl extends HTMLElement {
    static observedAttributes = [
        'label',
        'disabled'
    ];
    definition;
    currentValue;
    fieldName = '';
    runtime;
    room = '';
    root = this.attachShadow({
        mode: 'open'
    });
    get label() {
        return this.getAttribute('label') ?? this.fieldName;
    }
    get value() {
        return structuredClone(this.currentValue);
    }
    set value(value) {
        this.currentValue = structuredClone(value);
        this.writeValue();
        this.presentValidity();
    }
    async bind(runtime, room, type, field) {
        const definition = mdTypes((await runtime.types(room)).collection).find((entry)=>entry.name === type)?.fields[field];
        this.bindDefinition(runtime, room, field, definition);
    }
    bindDefinition(runtime, room, field, definition) {
        this[configure](runtime, room, field, definition);
    }
    [configure](runtime, room, field, definition) {
        if (!definition || definition.kind !== this.kind) throw new TypeError(`The ${field} field must have kind ${this.kind}.`);
        this.definition = definition;
        this.fieldName = field;
        this.runtime = runtime;
        this.room = room;
        this.render();
    }
    connectedCallback() {
        this.render();
    }
    focus(options) {
        this.root.querySelector('input, textarea, select, button')?.focus(options);
    }
    requiredMessage() {
        if (!this.definition) return 'Choose a field from an MD Type.';
        return this.currentValue === undefined && this.definition.required ? 'This field is required.' : '';
    }
    emitChange() {
        this.dispatchEvent(new CustomEvent('change', {
            bubbles: true,
            composed: true,
            detail: {
                value: this.value,
                validity: this.validity
            }
        }));
    }
}
class ScalarField extends FieldControl {
    control;
    caption = document.createElement('label');
    message = document.createElement('p');
    formatted = document.createElement('p');
    get validity() {
        let message = this.requiredMessage();
        if (!message && this.control?.validity.badInput) message = this.inputMessage;
        if (!message && this.currentValue !== undefined) message = this.valueMessage();
        return {
            valid: message === '',
            message
        };
    }
    attributeChangedCallback() {
        this.caption.textContent = this.label;
        if (this.control) this.control.disabled = this.hasAttribute('disabled');
    }
    render() {
        adopt(this.root, fieldStyles);
        this.control = this.createControl();
        this.control.id = 'value';
        this.control.lang = navigator.language;
        this.control.setAttribute('aria-describedby', 'message');
        this.caption.htmlFor = 'value';
        this.message.id = 'message';
        this.message.className = 'error';
        this.message.setAttribute('role', 'status');
        this.control.addEventListener('input', ()=>{
            this.currentValue = this.readValue();
            this.presentValidity();
        });
        this.control.addEventListener('change', (event)=>{
            event.stopPropagation();
            this.emitChange();
        });
        this.formatted.setAttribute('aria-live', 'polite');
        this.root.replaceChildren(this.caption, this.control, this.formatted, this.message);
        this.attributeChangedCallback();
        this.writeValue();
        this.presentValidity();
    }
    writeValue() {
        if (this.control) this.control.value = this.currentValue === undefined ? '' : String(this.currentValue);
    }
    get inputMessage() {
        return 'Enter text.';
    }
    createControl() {
        const input = document.createElement('textarea');
        input.rows = 2;
        return input;
    }
    readValue() {
        return this.control.value;
    }
    valueMessage() {
        return typeof this.currentValue === 'string' ? '' : this.inputMessage;
    }
    formattedValue() {
        return '';
    }
    presentValidity() {
        const { valid, message } = this.validity;
        this.message.textContent = message;
        this.control?.setAttribute('aria-invalid', String(!valid));
        this.control?.setCustomValidity(message);
        this.formatted.textContent = valid && this.currentValue !== undefined ? this.formattedValue() : '';
    }
}
export class StringField extends ScalarField {
    kind = 'string';
}
export class NumberField extends ScalarField {
    kind = 'number';
    get inputMessage() {
        return 'Enter a number.';
    }
    createControl() {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = 'any';
        return input;
    }
    readValue() {
        return this.control.value === '' ? undefined : this.control.valueAsNumber;
    }
    valueMessage() {
        return typeof this.currentValue === 'number' && Number.isFinite(this.currentValue) ? '' : this.inputMessage;
    }
    formattedValue() {
        return new Intl.NumberFormat(navigator.language, {
            maximumSignificantDigits: 21
        }).format(this.currentValue);
    }
}
export class DateField extends ScalarField {
    kind = 'date';
    get inputMessage() {
        return 'Choose a valid date.';
    }
    createControl() {
        const input = document.createElement('input');
        input.type = 'date';
        return input;
    }
    readValue() {
        return this.control.value || undefined;
    }
    valueMessage() {
        return typeof this.currentValue === 'string' && this.control?.value === this.currentValue && this.currentValue !== '' ? '' : this.inputMessage;
    }
    formattedValue() {
        return new Intl.DateTimeFormat(navigator.language, {
            dateStyle: 'medium',
            timeZone: 'UTC'
        }).format(this.control.valueAsDate);
    }
}
export class EnumField extends ScalarField {
    kind = 'enum';
    get inputMessage() {
        return 'Choose an available value.';
    }
    choices() {
        return this.definition.values;
    }
    createControl() {
        return document.createElement('select');
    }
    readValue() {
        return this.control.value || undefined;
    }
    valueMessage() {
        return typeof this.currentValue === 'string' && this.choices().includes(this.currentValue) ? '' : this.inputMessage;
    }
    writeValue() {
        if (!this.control || !this.definition) return;
        const choices = this.choices();
        this.control.replaceChildren(new Option('Choose a value', ''), ...choices.map((value)=>new Option(value, value)));
        if (this.currentValue !== undefined && !choices.includes(this.currentValue)) {
            const unavailable = new Option(`Unavailable: ${String(this.currentValue)}`, String(this.currentValue));
            unavailable.disabled = true;
            this.control.append(unavailable);
        }
        super.writeValue();
    }
}
export class ListField extends FieldControl {
    kind = 'list';
    group = document.createElement('fieldset');
    legend = document.createElement('legend');
    message = document.createElement('p');
    add = document.createElement('button');
    items = [];
    get validity() {
        let message = this.requiredMessage();
        if (!message && this.currentValue !== undefined) {
            if (!Array.isArray(this.currentValue)) message = 'Enter a list.';
            else if (this.items.some((item)=>!item.validity.valid)) message = 'Complete each item.';
        }
        return {
            valid: message === '',
            message
        };
    }
    focus(options) {
        (this.items[0] ?? this.add).focus(options);
    }
    attributeChangedCallback() {
        this.legend.textContent = this.label;
        const disabled = this.hasAttribute('disabled');
        this.group.disabled = disabled;
        for (const [index, item] of this.items.entries()){
            item.setAttribute('label', `${this.label} ${index + 1}`);
            item.toggleAttribute('disabled', disabled);
        }
    }
    render() {
        adopt(this.root, fieldStyles);
        this.message.className = 'error';
        this.message.id = 'message';
        this.message.setAttribute('role', 'status');
        this.group.setAttribute('aria-describedby', 'message');
        this.add.type = 'button';
        this.add.textContent = 'Add item';
        this.add.onclick = ()=>{
            this.currentValue = [
                ...Array.isArray(this.currentValue) ? this.currentValue : [],
                this.definition.of?.kind === 'string' ? '' : undefined
            ];
            this.writeValue();
            this.presentValidity();
            this.items.at(-1).focus();
            this.emitChange();
        };
        this.root.replaceChildren(this.group, this.message);
        this.writeValue();
        this.presentValidity();
    }
    writeValue() {
        this.items = [];
        this.group.replaceChildren(this.legend);
        if (this.definition && Array.isArray(this.currentValue)) {
            for (const [index, value] of this.currentValue.entries()){
                const item = document.createElement(`md-${this.definition.of.kind}-field`);
                item[configure](this.runtime, this.room, this.fieldName, {
                    ...this.definition.of,
                    ...this.definition.to === undefined ? {} : {
                        to: this.definition.to
                    },
                    required: true
                });
                item.value = value;
                const row = document.createElement('div');
                row.className = 'item';
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.textContent = 'Remove';
                remove.setAttribute('aria-label', `Remove item ${index + 1}`);
                remove.onclick = ()=>{
                    this.currentValue = this.items.filter((_, position)=>position !== index).map((entry)=>entry.value);
                    this.writeValue();
                    this.presentValidity();
                    (this.items[index] ?? this.add).focus();
                    this.emitChange();
                };
                item.addEventListener('input', (event)=>{
                    event.stopPropagation();
                    this.readItems();
                });
                item.addEventListener('change', (event)=>{
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
    presentValidity() {
        this.message.textContent = this.validity.message;
        this.group.setAttribute('aria-invalid', String(!this.validity.valid));
    }
    readItems() {
        this.currentValue = this.items.map((item)=>item.value);
        this.presentValidity();
    }
}
export class ReferenceField extends EnumField {
    kind = 'reference';
    unobserve;
    paths = [];
    bindDefinition(runtime, room, field, definition) {
        super.bindDefinition(runtime, room, field, definition);
        this.watch();
    }
    connectedCallback() {
        super.connectedCallback();
        this.watch();
    }
    disconnectedCallback() {
        this.unobserve?.();
        this.unobserve = undefined;
    }
    choices() {
        return this.paths;
    }
    queryOptions() {
        return {
            rooms: [
                this.room
            ],
            ...this.definition.to === 'any' ? {} : {
                types: [
                    this.definition.to
                ]
            },
            select: {},
            orderBy: [
                {
                    by: 'path'
                }
            ]
        };
    }
    watch() {
        this.unobserve?.();
        this.unobserve = undefined;
        if (this.isConnected && this.definition && this.runtime !== undefined) {
            this.unobserve = observation(this.runtime.observe('query', this.queryOptions()), (result)=>{
                this.paths = result.documents.map((document1)=>document1.path);
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
