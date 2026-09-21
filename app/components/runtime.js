export function mdTypes(result) {
    return result === undefined || result.status === 'unavailable' ? [] : result.types;
}
export function observation(start) {
    let stop;
    let closed = false;
    void start.then((end)=>{
        if (closed) {
            end();
            return;
        }
        stop = end;
    });
    return ()=>{
        closed = true;
        stop?.();
    };
}
export const queueKinds = {
    pending: 'Pending',
    conflicted: 'Conflicted',
    rejected: 'Rejected',
    expired: 'Expired',
    'retryable-refusal': 'Pending'
};
export function refusalParts(refusal) {
    return [
        refusal.code,
        ...Object.entries(refusal.fields).flatMap(([name, value])=>[
                name,
                typeof value === 'string' ? value : JSON.stringify(value)
            ])
    ];
}
