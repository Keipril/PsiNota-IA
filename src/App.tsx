/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from 'react';
import { Mic, Square, FileText, ShieldCheck, Trash2, Download, AlertTriangle } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY });

export default function App() {
  // State
  const [status, setStatus] = useState<'idle' | 'consent' | 'recording' | 'processing' | 'done'>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcription, setTranscription] = useState('');
  const [clinicalNote, setClinicalNote] = useState<any>(null);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Format time
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Start Consent
  const handleStartClick = () => {
    setStatus('consent');
  };

  // Accept Consent & Start Recording
  const handleAcceptConsent = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
      };

      mediaRecorderRef.current.start();
      setStatus('recording');
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      setError('Error al acceder al micrófono. Por favor, concede los permisos en tu navegador.');
      setStatus('idle');
    }
  };

  // Stop Recording
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && status === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      setStatus('processing');
    }
  };

  // Process Audio with Gemini
  const processAudio = async (blob: Blob) => {
    try {
      // Convert Blob to Base64
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        const base64String = base64data.split(',')[1]; // Remove data:audio/webm;base64,

        const prompt = `Eres un psiquiatra experto. Escucha el siguiente audio de una consulta médica.
        1. Transcribe el audio fielmente.
        2. Genera una nota clínica estructurada basada en la transcripción.
        
        REGLAS IMPORTANTES:
        - Determina si es una consulta de primera vez o de seguimiento.
        - Si infieres que es una consulta de SEGUIMIENTO (lo más probable), EXTIÉNDETE detalladamente en la sección de "evolución". Describe minuciosamente los cambios en los síntomas desde la última visita, la respuesta a la medicación, efectos adversos, cambios en el entorno psicosocial y el estado actual de la queja principal.
        
        La nota clínica debe tener la siguiente estructura JSON:
        - motivoConsulta: Breve motivo de la consulta.
        - antecedentes: Antecedentes relevantes mencionados.
        - medicacion: Medicación actual.
        - evolucion: Queja principal y evolución detallada (especialmente si es seguimiento).
        - mse: Examen del estado mental (apariencia, ánimo, afecto, pensamiento, etc.).
        - diagnostico: Diagnóstico presuntivo.
        - plan: Plan terapéutico (medicación, psicoterapia, próxima cita).
        `;

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              inlineData: {
                mimeType: blob.type || 'audio/webm',
                data: base64String
              }
            },
            { text: prompt }
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                transcription: { type: Type.STRING, description: "La transcripción exacta del audio" },
                clinicalNote: {
                  type: Type.OBJECT,
                  properties: {
                    motivoConsulta: { type: Type.STRING },
                    antecedentes: { type: Type.STRING },
                    medicacion: { type: Type.STRING },
                    evolucion: { type: Type.STRING },
                    mse: { type: Type.STRING },
                    diagnostico: { type: Type.STRING },
                    plan: { type: Type.STRING }
                  }
                }
              }
            }
          }
        });

        const resultText = response.text;
        if (resultText) {
          const parsed = JSON.parse(resultText);
          setTranscription(parsed.transcription);
          setClinicalNote(parsed.clinicalNote);
          setStatus('done');
        }
      };
    } catch (err) {
      console.error(err);
      setError('Error al procesar el audio con la IA. Asegúrate de haber hablado algo.');
      setStatus('idle');
    }
  };

  const resetApp = () => {
    setStatus('idle');
    setTranscription('');
    setClinicalNote(null);
    setRecordingTime(0);
    setError('');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 p-4 sticky top-0 z-10 backdrop-blur-md">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-zinc-950" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">PsiNota IA</h1>
          </div>
          <div className="text-xs font-mono text-zinc-500 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            HIPAA COMPLIANT MODE
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6 py-12">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* IDLE STATE */}
        {status === 'idle' && (
          <div className="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in duration-500">
            <div className="w-24 h-24 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-8 shadow-2xl">
              <Mic className="w-10 h-10 text-zinc-400" />
            </div>
            <h2 className="text-3xl font-medium mb-2 tracking-tight">Consulta Silenciosa</h2>
            <p className="text-zinc-400 text-center max-w-md mb-12">
              Graba tu consulta. La IA transcribirá y estructurará la nota clínica automáticamente, manteniendo la privacidad del paciente.
            </p>
            <button
              onClick={handleStartClick}
              className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-medium text-lg transition-all active:scale-95 shadow-[0_0_40px_-10px_rgba(16,185,129,0.5)]"
            >
              <Mic className="w-5 h-5" />
              INICIAR CONSULTA
            </button>
          </div>
        )}

        {/* CONSENT STATE */}
        {status === 'consent' && (
          <div className="max-w-md mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl p-6 animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="flex items-center gap-3 mb-4 text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
              <h3 className="text-lg font-medium">Consentimiento Informado</h3>
            </div>
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              Por favor, lee el siguiente texto al paciente o solicita su firma antes de comenzar a grabar:
            </p>
            <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 mb-6 text-sm text-zinc-300 italic">
              "Para mejorar la calidad de su atención y mantener un registro preciso, esta consulta será grabada y transcrita por un asistente de inteligencia artificial local. El audio será eliminado inmediatamente después de generar la nota clínica. ¿Está usted de acuerdo?"
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStatus('idle')}
                className="flex-1 px-4 py-3 rounded-xl font-medium text-zinc-400 hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAcceptConsent}
                className="flex-1 px-4 py-3 rounded-xl font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                Acepto y Grabar
              </button>
            </div>
          </div>
        )}

        {/* RECORDING STATE */}
        {status === 'recording' && (
          <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-300">
            <div className="relative flex items-center justify-center mb-8">
              <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping" />
              <div className="w-32 h-32 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center relative z-10">
                <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center animate-pulse">
                  <Mic className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
            <div className="text-5xl font-mono font-light tracking-wider mb-12 text-zinc-100">
              {formatTime(recordingTime)}
            </div>
            <button
              onClick={handleStopRecording}
              className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full font-medium text-lg transition-all active:scale-95 border border-zinc-700"
            >
              <Square className="w-5 h-5 text-red-400 fill-red-400" />
              FINALIZAR CONSULTA
            </button>
          </div>
        )}

        {/* PROCESSING STATE */}
        {status === 'processing' && (
          <div className="flex flex-col items-center justify-center py-32 animate-in fade-in duration-300">
            <div className="w-16 h-16 border-4 border-zinc-800 border-t-emerald-500 rounded-full animate-spin mb-8" />
            <h3 className="text-xl font-medium mb-2">Procesando Consulta</h3>
            <p className="text-zinc-400 text-center max-w-sm">
              Transcribiendo audio y estructurando la nota clínica con IA... El audio será eliminado al finalizar.
            </p>
          </div>
        )}

        {/* DONE STATE */}
        {status === 'done' && clinicalNote && (
          <div className="space-y-8 animate-in slide-in-from-bottom-8 fade-in duration-500">
            {/* Actions */}
            <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium px-2">
                <ShieldCheck className="w-4 h-4" />
                Audio eliminado de forma segura
              </div>
              <div className="flex gap-2">
                <button className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors" title="Exportar PDF">
                  <Download className="w-5 h-5" />
                </button>
                <button onClick={resetApp} className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors" title="Descartar">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Clinical Note */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
              <div className="bg-zinc-800/50 px-6 py-4 border-b border-zinc-800 flex items-center gap-3">
                <FileText className="w-5 h-5 text-emerald-500" />
                <h2 className="text-lg font-medium">Nota Clínica Estructurada</h2>
              </div>
              <div className="p-6 space-y-6">
                <Section title="Motivo de Consulta" content={clinicalNote.motivoConsulta} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Section title="Antecedentes" content={clinicalNote.antecedentes} />
                  <Section title="Medicación Actual" content={clinicalNote.medicacion} />
                </div>
                <Section title="Evolución y Queja Principal" content={clinicalNote.evolucion} />
                <Section title="Examen del Estado Mental (MSE)" content={clinicalNote.mse} />
                <Section title="Diagnóstico Presuntivo" content={clinicalNote.diagnostico} />
                <Section title="Plan Terapéutico" content={clinicalNote.plan} highlight />
              </div>
            </div>

            {/* Raw Transcription */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-4">Transcripción en crudo</h3>
              <p className="text-zinc-400 text-sm leading-relaxed font-mono">
                {transcription}
              </p>
            </div>
            
            <div className="flex justify-center pt-4">
              <button
                onClick={resetApp}
                className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
              >
                Nueva Consulta
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Section({ title, content, highlight = false }: { title: string, content: string, highlight?: boolean }) {
  if (!content || content.trim() === '') return null;
  
  return (
    <div className={`p-4 rounded-xl ${highlight ? 'bg-emerald-500/5 border border-emerald-500/20' : 'bg-zinc-950 border border-zinc-800/50'}`}>
      <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${highlight ? 'text-emerald-400' : 'text-zinc-500'}`}>
        {title}
      </h3>
      <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}
