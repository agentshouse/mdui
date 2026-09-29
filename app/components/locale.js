function formattingLocale(requested) {
    try {
        return new Intl.Locale(requested).toString();
    } catch  {
        return new Intl.DateTimeFormat().resolvedOptions().locale;
    }
}
export const locale = formattingLocale(navigator.language);
