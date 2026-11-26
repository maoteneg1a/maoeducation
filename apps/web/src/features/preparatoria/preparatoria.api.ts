import { apiGet, apiPost, apiPut } from '@/shared/lib/api-client'
export interface Indicator { key: string; code: string; text: string; ambit: string; competencyCode: string; competencyText: string }
export interface PrepOption { id: string; name: string; levelName: string; yearId: string; yearName: string; isActiveYear: boolean; enabled: boolean }
export interface PrepContext {
 parallel: { id: string; name: string; levelName: string; yearId: string; yearName: string; tutorName: string | null }
 periods: { id: string; name: string; isActive: boolean; isClosed: boolean }[]
 program: null | { id: string; enabled: boolean; revision: number; catalogVersion: string; scaleVersion: string; catalog: Indicator[]; selections: Record<string,string[]>; ambitTeachers: Record<string,string>; reviewedAt: string | null }
 ambits: { id: string; name: string }[]; catalogSource: string; teachers: { id: string; name: string }[]
 canConfigure: boolean; curriculumLocked: boolean; editableAmbits: string[]; canComment: boolean; scale: { code: string; label: string }[]
}
export interface PrepValue { studentId: string; itemKey: string; code: string | null; notes: string }
export interface PrepComment { studentId: string; text: string }
export interface PrepSheet { revision: number; selectedKeys: string[]; students: { id: string; name: string; document: string }[]; values: PrepValue[]; comments: PrepComment[] }
export interface PrepReport { catalogVersion: string; scaleVersion: string; scale: {code: string; label: string}[]; ambits: {id:string;name:string}[]; rows: (Indicator & { periods: Record<string,{selected:boolean;code:string|null;notes:string}> })[]; comments: {periodId:string;text:string}[] }
const path = (action:string, parallelId:string, periodId?:string) => `preparatoria/${action}?${new URLSearchParams({parallelId,...(periodId?{periodId}:{})})}`
export const prepApi = {
 options: () => apiGet<{parallels:PrepOption[]}>('preparatoria/options'),
 context: (id:string) => apiGet<PrepContext>(path('context',id)),
 prepare: (id:string) => apiPost<PrepContext>(path('prepare',id)),
 configure: (id:string,data:unknown) => apiPut<PrepContext>(path('program',id),data),
 sheet: (id:string,period:string) => apiGet<PrepSheet>(path('sheet',id,period)),
 selection: (id:string,period:string,data:unknown) => apiPut<PrepSheet>(path('selection',id,period),data),
 save: (id:string,period:string,data:unknown) => apiPut<PrepSheet>(path('values',id,period),data),
 history: (id:string) => apiGet<{items:{id:string;action:string;userId:string;createdAt:string}[]}>(path('history',id)),
}
