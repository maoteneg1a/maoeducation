import './stop-game.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, Copy, Hand, Loader2, Plus, Trophy, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { gameRequest, loadGuest, normalizeWord, sessionKey, type GuestSession, type GameConfig, type RoomView } from './stop-game.api';
const path = '/juegos/parame-la-mano';
const box = 'rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm';
export function StopGamePage() {
    const navigate = useNavigate();
    const { code: rawCode } = useParams(), code = rawCode?.toUpperCase() ?? '';
    const [session, setSession] = useState<GuestSession | null>(() => code ? loadGuest(code) : null);
    useEffect(() => setSession(code ? loadGuest(code) : null), [code]);
    return <div className="stop-game min-h-screen bg-[#f4f6fb] text-slate-900 pb-24 [color-scheme:light]">
    <header className="border-b bg-white">
    <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
    <Link to={path} className="font-bold tracking-tight text-xl">auleka<span className="text-teal-700"> · juega</span>
    </Link>
    <span className="text-xs font-medium text-slate-500">Sin cuenta · con amigos</span>
    </div>
    </header>
    <main className="max-w-6xl mx-auto px-4 py-7 sm:py-10">{session && session.code === code ? <Room key={session.token} session={session} onExit={() => { localStorage.removeItem(sessionKey(code)); setSession(null); navigate(path); }}/> : <Entrance key={code} code={code} joined={s => { localStorage.setItem(sessionKey(s.code), JSON.stringify(s)); setSession(s); navigate(`${path}/${s.code}`); }}/>}</main>
    </div>;
}
function Entrance({ code, joined }: {
    code: string;
    joined: (s: GuestSession) => void;
}) {
    const navigate = useNavigate(), [name, setName] = useState(''), [roomCode, setCode] = useState(code), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const enter = async (create: boolean) => { setBusy(true); setError(''); try {
        const session = await gameRequest<GuestSession>(create ? '' : `/${roomCode.trim().toUpperCase()}/join`, undefined, { name: name.trim() });
        joined(session);
        navigate(`${path}/${session.code}`);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } };
    return <div className="grid gap-8 lg:grid-cols-2 items-center max-w-5xl mx-auto">
    <div>
    <span className="inline-flex items-center gap-2 rounded-full bg-teal-100 text-teal-900 px-3 py-1 text-sm font-semibold">
    <Users className="w-4 h-4"/>2 a 12 jugadores en línea</span>
    <h1 className="text-5xl sm:text-6xl font-black tracking-tight mt-5 leading-[1.05]">Párame<br />la <span className="text-teal-700">mano.</span>
    <Hand className="inline-block ml-3 w-12 h-12 text-amber-500 -rotate-12"/>
    </h1>
    <p className="text-lg text-slate-600 mt-5 max-w-md">Una letra. Muchas ideas. Completa las categorías y haz STOP antes que tus amigos.</p>
    <div className="flex gap-3 my-7" aria-hidden="true">{['A', 'B', 'C'].map((l, i) => <span key={l} className={`flex items-center justify-center w-16 h-20 text-4xl font-black rounded-xl shadow-sm ${i === 1 ? 'bg-amber-300 rotate-6' : 'bg-white border -rotate-3'}`}>{l}</span>)}</div>
    <ol className="space-y-2 text-sm text-slate-600">
    <li>1. Entra con tu nombre y comparte la sala.</li>
    <li>2. Escriban con la letra que toque. Quien termina hace STOP.</li>
    <li>3. Revisen las respuestas. Solo las cuestionadas se votan.</li>
    </ol>
    </div>
    <form className={box + ' space-y-5'} onSubmit={e => { e.preventDefault(); void enter(!!code ? false : !roomCode.trim()); }}>
    <h2 className="text-2xl font-bold">{code ? 'Te invitaron a jugar' : 'Vamos a jugar'}</h2>
    <label className="grid gap-2 text-sm font-medium">Tu nombre<Input required autoComplete="nickname" minLength={2} maxLength={25} value={name} onChange={e => setName(e.target.value)} placeholder="¿Cómo te llamas?" disabled={busy}/>
    </label>{!code && <Button type="button" className="w-full bg-teal-700 hover:bg-teal-800 text-white h-12" disabled={busy || name.trim().length < 2} onClick={() => void enter(true)}>{busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4 mr-2"/>}Crear sala</Button>}<label className="grid gap-2 text-sm font-medium">{code ? 'Código de la sala' : '¿Ya tienes una sala?'}<Input value={roomCode} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6))} maxLength={6} placeholder="Código de 6 caracteres" className="uppercase tracking-[.25em] font-bold" readOnly={!!code} disabled={busy}/>
    </label>
    <Button type="submit" variant="outline" className="w-full h-12" disabled={busy || name.trim().length < 2 || roomCode.trim().length !== 6}>{busy ? 'Entrando…' : 'Entrar como invitado'}</Button>{error && <p role="alert" className="text-red-700 text-sm">{error}</p>}<p className="text-xs text-slate-500">Sin correo ni contraseña. Puedes recargar la página y seguir jugando desde este navegador.</p>
    </form>
    </div>;
}
function Room({ session, onExit }: {
    session: GuestSession;
    onExit: () => void;
}) {
    const [room, setRoom] = useState<RoomView | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [gone, setGone] = useState(false);
    const latest = useRef<RoomView | null>(null), queue = useRef<Promise<unknown>>(Promise.resolve());
    const accept = useCallback((next: RoomView) => { if (!latest.current || next.revision >= latest.current.revision) {
        latest.current = next;
        setRoom(next);
    } }, []);
    useEffect(() => { let alive = true; const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>; const poll = async () => { try {
        const next = await gameRequest<RoomView>(`/${session.code}`, session, undefined, controller.signal);
        if (alive) {
            accept(next);
            setError('');
        }
    }
    catch (e) {
        if (alive) {
            setError((e as Error).message);
            if ([401, 403, 404].includes((e as {
                status: number;
            }).status)) {
                setGone(true);
                alive = false;
            }
        }
    }
    finally {
        if (alive)
            timer = setTimeout(poll, 1500);
    } }; void poll(); return () => { alive = false; controller.abort(); clearTimeout(timer); }; }, [session, accept]);
    const send = useCallback((command: unknown): Promise<RoomView> => { const task = queue.current.catch(() => { }).then(async () => { const next = await gameRequest<RoomView>(`/${session.code}/commands`, session, command); accept(next); return next; }); queue.current = task; return task; }, [session, accept]);
    const action = async (command: unknown) => { setBusy(true); try {
        await send(command);
    }
    catch (e) {
        toast.error((e as Error).message);
    }
    finally {
        setBusy(false);
    } };
    const leave = async () => { try {
        await send({ type: 'leave' });
        onExit();
    }
    catch (e) {
        toast.error((e as Error).message);
    } };
    if (gone)
        return <div className={box + ' max-w-xl mx-auto space-y-4'}>
        <h1 className="text-2xl font-bold">No puedes entrar a esta sala</h1>
        <p role="alert">{error}</p>
        <Button onClick={onExit}>Volver</Button>
        </div>;
    if (!room)
        return <div role="status" className="p-10 text-center">{error || 'Abriendo la sala…'}</div>;
    const state = room.state, host = state.hostId === session.playerId, round = state.round;
    const people = state.players.filter(p => !p.left), ranking = [...state.players].sort((a, b) => b.score - a.score), activeRound = round?.participants.map(id => state.players.find(p => p.id === id)!).filter(Boolean) ?? [];
    return <div className="space-y-6">
    <div className="flex flex-wrap gap-4 justify-between items-center">
    <div>
    <h1 className="text-3xl font-black">Párame la mano</h1>
    <p className="text-sm text-slate-500 mt-1">Sala <strong className="tracking-widest text-slate-900">{session.code}</strong> · {people.length}/12 jugadores</p>
    </div>
    <div className="flex gap-2">
    <Button variant="outline" onClick={async () => { try {
        await navigator.clipboard.writeText(`${location.origin}${path}/${session.code}`);
        toast.success('Enlace copiado');
    }
    catch {
        toast.info(`Comparte el código ${session.code}`);
    } }}>
    <Copy className="w-4 h-4 mr-2"/>Invitar</Button>
    <Button variant="ghost" disabled={busy} onClick={() => void leave()}>Salir</Button>
    </div>
    </div>{error && <p role="alert" className="rounded-lg bg-amber-100 text-amber-900 p-3 text-sm">Conexión interrumpida. Reintentando… Tus respuestas pendientes se conservan en pantalla.</p>}<div className="grid lg:grid-cols-[1fr_270px] gap-5 items-start">
    <div className="min-w-0 space-y-5">{state.phase === 'lobby' ? <Lobby key={JSON.stringify(state.config)} room={room} host={host} busy={busy} start={async (config) => { setBusy(true); try {
            await send({ type: 'configure', config });
            await send({ type: 'start' });
        }
        catch (e) {
            toast.error((e as Error).message);
        }
        finally {
            setBusy(false);
        } }}/> : round && <>
        <div className="rounded-2xl bg-teal-800 text-white p-5 flex justify-between items-center">
        <div>
        <p className="text-teal-100 text-sm">Ronda {round.number} de {state.config.rounds}</p>
        <h2 className="text-xl font-bold mt-1">{state.phase === 'playing' ? '¡A escribir!' : state.phase === 'review' ? '¡STOP! Revisemos' : state.phase === 'finished' ? 'Partida terminada' : 'Puntos de la ronda'}</h2>{round.stoppedBy && <p className="text-sm text-teal-100 mt-1">{state.players.find(p => p.id === round.stoppedBy)?.name} hizo STOP</p>}</div>
        <span className="bg-white text-teal-900 rounded-xl w-20 h-20 flex items-center justify-center text-6xl font-black shrink-0">{round.letter}</span>
        </div>{state.phase === 'playing' ? <Playing key={round.id} room={room} send={send}/> : <>
            <ReviewTable room={room} busy={busy} dispute={(playerId, category) => void action({ type: 'dispute', roundId: round.id, playerId, category })}/>{state.phase === 'review' ? <div className={box + ' space-y-4'}>
                <p className="text-sm text-slate-600">Las respuestas se aceptan salvo que alguien las cuestione. Las vacías o con otra letra valen 0.</p>
                <Disputes room={room} busy={busy} vote={(key, value) => void action({ type: 'vote', roundId: round.id, key, value })}/>
                <Button className="bg-teal-700 hover:bg-teal-800 text-white" disabled={busy || round.ready.includes(session.playerId)} onClick={() => void action({ type: 'ready', roundId: round.id })}>
                <Check className="w-4 h-4 mr-2"/>{round.ready.includes(session.playerId) ? 'Ya revisaste · esperando al grupo' : 'Todo revisado'}</Button>
                <p className="text-xs text-slate-500">{round.ready.filter(id => people.some(p => p.id === id)).length} de {activeRound.filter(p => !p.left).length} revisaron. Una mayoría decide cada conflicto; en empate, la palabra no suma.</p>
                </div> : <div className={box + ' space-y-4'}>{state.message && <p>{state.message}</p>}{state.phase === 'finished' ? <>
                    <Trophy className="w-10 h-10 text-amber-500"/>
                    <h2 className="text-2xl font-bold">{ranking.length ? ranking.filter(p => p.score === ranking[0].score).map(p => p.name).join(' y ') : ''}{ranking.filter(p => p.score === ranking[0]?.score).length === 1 ? ' gana' : ' empatan'} con {ranking[0]?.score ?? 0} puntos</h2>
                    <p className="text-sm text-slate-500">Los puntos se muestran por respuesta y en la clasificación.</p>
                    <Link className="inline-block underline text-teal-800" to={path}>Crear otra sala</Link>
                    </> : host ? <Button disabled={busy} onClick={() => void action({ type: 'next', roundId: round.id })}>Siguiente ronda</Button> : <p>Esperando a que quien organiza inicie la siguiente ronda.</p>}</div>}</>}</>}</div>
    <aside className={box + ' space-y-4'}>
    <h2 className="font-bold flex items-center gap-2">
    <Trophy className="h-5 w-5 text-amber-500"/>{state.phase === 'lobby' ? 'Jugadores' : 'Clasificación'}</h2>{ranking.map(p => <div key={p.id} className="flex gap-2 justify-between text-sm items-center">
        <div className="min-w-0">
        <span className="font-medium break-words">{p.name}{p.id === session.playerId ? ' (tú)' : ''}</span>
        <p className="text-xs text-slate-500">{p.left ? 'Salió' : room.offlineIds.includes(p.id) ? 'Desconectado' : p.id === state.hostId ? 'Organiza' : 'En la sala'}</p>
        </div>
        <div className="flex items-center gap-2">
        <strong>{p.score}</strong>{host && p.id !== session.playerId && !p.left && (state.phase === 'lobby' || room.offlineIds.includes(p.id)) && <button aria-label={`Retirar a ${p.name}`} onClick={() => void action({ type: 'remove', playerId: p.id })} disabled={busy} className="p-2 rounded hover:bg-slate-100">
            <X className="w-4 h-4"/>
            </button>}</div>
        </div>)}{!host && room.offlineIds.includes(state.hostId) && <Button variant="outline" disabled={busy} onClick={() => void action({ type: 'claimHost' })}>Continuar como anfitrión</Button>}<div className="border-t pt-4 text-xs text-slate-500 space-y-1">
    <p>Única: {state.config.uniquePoints} puntos</p>
    <p>Repetida: {state.config.repeatedPoints} puntos</p>
    <p>Inválida o vacía: 0 puntos</p>
    </div>
    </aside>
    </div>
    </div>;
}
function Lobby({ room, host, busy, start }: {
    room: RoomView;
    host: boolean;
    busy: boolean;
    start: (config: GameConfig) => Promise<void>;
}) {
    const [config, setConfig] = useState(room.state.config), [categories, setCategories] = useState(config.categories.join(', '));
    return <div className={box + ' space-y-5'}>
    <div>
    <h2 className="text-2xl font-bold">{host ? 'Prepara la partida' : 'Estamos reuniendo al grupo'}</h2>
    <p className="text-sm text-slate-500 mt-2">Comparte el enlace o el código. Todos entran con su nombre, sin registrarse.</p>
    </div>{host ? <>
        <label className="grid gap-2 text-sm font-medium">Categorías, separadas por coma<textarea className="w-full border rounded-lg p-3 min-h-28 text-sm" value={categories} onChange={e => setCategories(e.target.value)} maxLength={400}/>
        <span className="text-xs font-normal text-slate-500">De 3 a 12. Puedes agregar, quitar o cambiar las categorías.</span>
        </label>
        <div className="grid sm:grid-cols-3 gap-3">{[{ key: 'rounds', label: 'Rondas', min: 1, max: 10 }, { key: 'uniquePoints', label: 'Respuesta única', min: 1, max: 100 }, { key: 'repeatedPoints', label: 'Respuesta repetida', min: 0, max: 100 }].map(f => <label key={f.key} className="grid gap-2 text-sm font-medium">{f.label}<Input type="number" min={f.min} max={f.max} value={config[f.key as keyof Omit<GameConfig, 'categories'>]} onChange={e => setConfig(c => ({ ...c, [f.key]: Number(e.target.value) }))}/>
            </label>)}</div>
        <Button className="bg-teal-700 hover:bg-teal-800 text-white h-12" disabled={busy || room.state.players.filter(p => !p.left).length < 2} onClick={() => void start({ ...config, categories: categories.split(',').map(s => s.trim()).filter(Boolean) })}>{busy ? 'Preparando…' : 'Empezar partida'}</Button>{room.state.players.filter(p => !p.left).length < 2 && <p className="text-sm text-slate-500">Falta al menos un amigo para empezar.</p>}</> : <>
        <div className="flex flex-wrap gap-2">{config.categories.map(c => <span key={c} className="px-3 py-1 rounded-full bg-slate-100 text-sm">{c}</span>)}</div>
        <p className="text-sm">Quien organiza ajustará las categorías y empezará la partida.</p>
        </>}</div>;
}
function Playing({ room, send }: {
    room: RoomView;
    send: (command: unknown) => Promise<RoomView>;
}) {
    const round = room.state.round!, initial = round.drafts[room.playerId];
    const [words, setWords] = useState<string[]>(initial?.words ?? room.state.config.categories.map(() => '')), [status, setStatus] = useState('Guardado'), [stopping, setStopping] = useState(false);
    const sequence = useRef(initial?.sequence ?? 0), pending = useRef(false), timer = useRef<ReturnType<typeof setTimeout>>(), liveWords = useRef(words), mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; clearTimeout(timer.current); }; }, []);
    const save = useCallback(async () => { if (!pending.current)
        return; const snapshot = [...liveWords.current]; pending.current = false; try {
        await send({ type: 'draft', roundId: round.id, sequence: ++sequence.current, words: snapshot });
        if (mounted.current)
            setStatus(pending.current ? 'Guardando…' : 'Guardado');
    }
    catch {
        if (mounted.current) {
            pending.current = true;
            setStatus('Sin guardar · reintentando…');
            timer.current = setTimeout(() => void save(), 1500);
        }
    } }, [send, round.id]);
    const edit = (index: number, value: string) => { const next = [...liveWords.current]; next[index] = value; liveWords.current = next; setWords(next); pending.current = true; setStatus('Guardando…'); clearTimeout(timer.current); timer.current = setTimeout(() => void save(), 250); };
    const stop = async () => { clearTimeout(timer.current); setStopping(true); try {
        await send({ type: 'stop', roundId: round.id, sequence: ++sequence.current, words: liveWords.current });
    }
    catch (e) {
        toast.error((e as Error).message);
        if (mounted.current)
            setStopping(false);
    } };
    const complete = words.every(w => !!normalizeWord(w) && normalizeWord(w).startsWith(round.letter));
    return <div className={box + ' space-y-5'}>
    <p className="text-sm text-slate-500">Empieza cada respuesta con <strong>{round.letter}</strong>. Tus palabras se revelan después del STOP.</p>
    <div className="grid sm:grid-cols-2 gap-4">{room.state.config.categories.map((category, index) => <label key={category} className="grid gap-2 text-sm font-semibold">{category}<Input autoComplete="off" spellCheck={false} maxLength={80} value={words[index]} disabled={stopping} placeholder={`${round.letter}…`} onChange={e => edit(index, e.target.value)}/>{words[index] && !normalizeWord(words[index]).startsWith(round.letter) && <span className="text-xs font-normal text-red-700">Debe comenzar con {round.letter}</span>}</label>)}</div>
    <div className="flex flex-wrap items-center gap-3">
    <Button className="bg-rose-600 hover:bg-rose-700 text-white font-black text-xl h-14 px-8" disabled={!complete || stopping} onClick={() => void stop()}>
    <Hand className="h-6 w-6 mr-2"/>{stopping ? 'STOP…' : '¡STOP!'}</Button>
    <span role="status" className="text-xs text-slate-500">{status}</span>
    </div>
    </div>;
}
function ReviewTable({ room, busy, dispute }: {
    room: RoomView;
    busy: boolean;
    dispute: (id: string, category: number) => void;
}) {
    const state = room.state, round = state.round!, review = state.phase === 'review', scored = Object.keys(round.points).length > 0;
    return <div className={box + ' !p-0 overflow-hidden'}>
    <div className="overflow-x-auto">
    <table className="w-full text-sm text-left">
    <thead className="bg-slate-50">
    <tr>
    <th className="p-3 min-w-36">Categoría</th>{round.participants.map(id => <th key={id} className="p-3 min-w-40">{state.players.find(p => p.id === id)?.name}</th>)}</tr>
    </thead>
    <tbody>{state.config.categories.map((category, index) => <tr className="border-t" key={category}>
        <th className="p-3 align-top font-medium">{category}</th>{round.participants.map(id => {
                const word = round.drafts[id]?.words[index] ?? '', valid = !!normalizeWord(word) && normalizeWord(word).startsWith(round.letter), conflict = round.disputes[`${index}:${normalizeWord(word)}`];
                return <td className="p-3 align-top" key={id}>
                <p className="font-medium break-words">{word || '—'}</p>{scored ? <span className="text-xs text-teal-800">{round.points[id]?.[index] ?? 0} puntos</span> : !valid ? <span className="text-xs text-slate-500">{word ? 'Otra letra · 0 puntos' : 'Vacía · 0 puntos'}</span> : conflict ? <span className={`text-xs ${conflict.verdict === false ? 'text-red-700' : 'text-teal-800'}`}>{conflict.verdict === null ? 'En votación' : conflict.verdict ? 'Aceptada' : 'No válida'}</span> : review ? <button className="text-xs text-slate-500 underline mt-1" disabled={busy} onClick={() => dispute(id, index)}>Cuestionar</button> : null}</td>;
            })}</tr>)}</tbody>
    </table>
    </div>
    </div>;
}
function Disputes({ room, busy, vote }: {
    room: RoomView;
    busy: boolean;
    vote: (key: string, value: boolean) => void;
}) {
    const disputes = Object.values(room.state.round!.disputes);
    return <>{disputes.map(d => <div key={d.key} className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
        <p className="font-semibold">¿“{d.word}” es válido en {room.state.config.categories[d.category]}?</p>
        <p className="text-xs text-slate-600">{Object.values(d.votes).filter(Boolean).length} a favor · {Object.values(d.votes).filter(v => !v).length} en contra{d.verdict !== null ? ` · ${d.verdict ? 'Aceptada por mayoría' : 'No suma puntos'}` : ''}</p>{d.verdict === null && (d.votes[room.playerId] === undefined ? <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={() => vote(d.key, true)}>Sí, es válida</Button>
            <Button variant="outline" disabled={busy} onClick={() => vote(d.key, false)}>No es válida</Button>
            </div> : <p className="text-xs">Ya votaste. Esperando al grupo.</p>)}</div>)}</>;
}
