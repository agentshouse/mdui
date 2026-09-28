export function mdTypes(result) {
    return result === undefined || result.status === 'unavailable' ? [] : result.types;
}
export function observation(start, receive) {
    let stop;
    let closed = false;
    void start.then((handle)=>{
        if (closed) {
            handle.close();
            return;
        }
        receive(handle.current());
        const unsubscribe = handle.subscribe(receive);
        stop = ()=>{
            unsubscribe();
            handle.close();
        };
    });
    return ()=>{
        closed = true;
        stop?.();
    };
}
export const returnedKinds = {
    conflicted: 'Conflicted',
    rejected: 'Rejected',
    expired: 'Expired',
    withdrawn: 'Withdrawn'
};
export const queueStates = {
    waiting: 'Waiting',
    submitted: 'Submitted',
    reset: 'Reset'
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
