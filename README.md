# PsiNota-IA
Transcriptor de audio de la consulta médica mediante IA.

--- INICIO DE LA EXPORTACIÓN DEL PROYECTO PSINOTA IA ---
Contexto del Proyecto:
Aplicación Android nativa escrita en Kotlin usando Jetpack Compose.
Objetivo: Grabar consultas psiquiátricas, transcribirlas usando la API de Groq (Whisper), generar notas clínicas estructuradas usando Llama-3.1 (vía Groq) y almacenar las notas de forma segura y encriptada usando Room + SQLCipher.
Requisitos clave: Privacidad extrema (HIPAA-like), borrado seguro del audio inmediato, almacenamiento local cifrado.
Estructura de Carpetas (app/src/main/java/com/psinota/app/):
MainActivity.kt (Punto de entrada)
audio/AudioRecorder.kt (Manejo de MediaRecorder)
ai/GroqApiService.kt (Interfaz Retrofit)
ai/GroqModels.kt (Data classes para JSON)
ai/TranscriptionManager.kt (Llamada a Whisper)
ai/NoteGenerator.kt (Llamada a Llama-3.1)
ai/ClinicalPrompt.kt (Prompt maestro de psiquiatría)
data/NoteEntity.kt (Tabla Room)
data/NoteDao.kt (Consultas Room)
data/AppDatabase.kt (Configuración Room + SQLCipher)
ui/navigation/AppNavigation.kt (NavHost)
ui/screens/HomeScreen.kt (Botón de grabar y permisos)
ui/screens/NoteDetailScreen.kt (Visualización y borrado de audio)
ui/screens/HistoryScreen.kt (Lista de notas guardadas)
Dependencias Clave (build.gradle.kts):
code
Kotlin
implementation("androidx.core:core-ktx:1.12.0")
implementation("androidx.activity:activity-compose:1.8.2")
implementation(platform("androidx.compose:compose-bom:2023.10.01"))
implementation("androidx.compose.ui:ui")
implementation("androidx.compose.material3:material3")
implementation("androidx.security:security-crypto:1.1.0-alpha06")
implementation("net.zetetic:android-database-sqlcipher:4.5.4")
implementation("androidx.room:room-runtime:2.6.1")
implementation("androidx.room:room-ktx:2.6.1")
ksp("androidx.room:room-compiler:2.6.1")
implementation("com.google.accompanist:accompanist-permissions:0.34.0")
implementation("com.squareup.retrofit2:retrofit:2.9.0")
implementation("com.squareup.retrofit2:converter-gson:2.9.0")
Código Core 1: El Prompt Maestro (ClinicalPrompt.kt)
code
Kotlin
package com.psinota.app.ai

object ClinicalPrompt {
    fun buildPrompt(transcription: String): String {
        return """
            Eres un psiquiatra experto, meticuloso y altamente profesional. Tu tarea es analizar la siguiente transcripción de una consulta psiquiátrica y generar una nota clínica estructurada, formal y concisa en español.

            REGLAS ESTRICTAS:
            1.  **Tono y Estilo:** Utiliza lenguaje médico, objetivo y profesional. Evita lenguaje coloquial en la redacción de la nota, excepto cuando cites textualmente al paciente (usa comillas "").
            2.  **Privacidad:** NO inventes nombres ni datos identificativos si no se mencionan explícitamente. Si no se menciona un dato, escribe "No especificado".
            3.  **Objetividad:** Diferencia claramente entre los síntomas reportados por el paciente (subjetivo) y tus observaciones (objetivo).
            4.  **TIPO DE CONSULTA (¡MUY IMPORTANTE!):** Analiza la transcripción para determinar si es una consulta de primera vez o de seguimiento. 
                - Si infieres que es una consulta de **SEGUIMIENTO** (lo más probable), debes **EXTENDERTE DETALLADAMENTE** en la sección de "evolución". Describe minuciosamente los cambios en los síntomas desde la última visita, la respuesta a la medicación (eficacia y tolerancia), efectos adversos reportados, cambios en el entorno psicosocial, sueño, apetito y el estado actual de la queja principal.
            5.  **Formato:** Debes devolver ÚNICAMENTE un objeto JSON válido con la estructura exacta que se detalla a continuación. No incluyas texto introductorio ni explicaciones fuera del JSON.

            ESTRUCTURA JSON REQUERIDA:
            {
              "motivoConsulta": "Breve descripción del motivo principal de la consulta (ej. Control farmacológico, Evaluación inicial).",
              "antecedentes": "Antecedentes médicos, psiquiátricos, familiares o toxicológicos relevantes mencionados.",
              "medicacion": "Lista clara de la medicación actual, dosis y frecuencia (si se menciona).",
              "evolucion": "Resumen detallado de la evolución clínica. Si es seguimiento, explayarse en respuesta al tratamiento, efectos adversos, cambios en síntomas (sueño, apetito, ánimo) y estresores actuales.",
              "mse": "Examen del Estado Mental (Mental Status Examination). Inferir a partir de la conversación: apariencia, actitud, conducta, habla, ánimo, afecto, contenido del pensamiento, curso del pensamiento, percepción, cognición, insight, juicio.",
              "diagnostico": "Diagnóstico presuntivo o impresiones clínicas (incluir códigos CIE-10/DSM-5 si es posible inferirlos con alta certeza, de lo contrario, solo descripción).",
              "plan": "Plan terapéutico: ajustes de medicación (especificar qué se sube, baja o mantiene), recomendaciones de psicoterapia, estudios solicitados, indicaciones generales y fecha aproximada de la próxima cita."
            }

            TRANSCRIPCIÓN DE LA CONSULTA:
            \"\"\"
            $transcription
            \"\"\"
        """.trimIndent()
    }
}
Código Core 2: Base de Datos Encriptada (AppDatabase.kt)
code
Kotlin
package com.psinota.app.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import net.sqlcipher.database.SupportFactory

@Database(entities = [NoteEntity::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun noteDao(): NoteDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val passphrase = "PsiNota_Super_Secret_Key_2026!".toByteArray()
                val factory = SupportFactory(passphrase)

                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "psinota_encrypted_database.db"
                )
                .openHelperFactory(factory) // Encriptación SQLCipher
                .build()
                
                INSTANCE = instance
                instance
            }
        }
    }
}
Código Core 3: Borrado Seguro (NoteDetailScreen.kt snippet)
code
Kotlin
// BORRADO SEGURO DEL AUDIO (Se ejecuta apenas se abre esta pantalla)
    LaunchedEffect(Unit) {
        if (audioFilePath.isNotEmpty()) {
            val audioFile = File(audioFilePath)
            if (audioFile.exists()) {
                val deleted = audioFile.delete()
                println("Audio borrado por privacidad: $deleted")
            }
        }
    }
Estado Actual del Desarrollo:
UI básica (Home, Historial, Detalle) implementada en Compose.
Grabación de audio temporal configurada.
Integración con API de Groq (Whisper + Llama 3.1) estructurada vía Retrofit.
Base de datos local cifrada configurada.
Prompt maestro optimizado para psiquiatría (énfasis en evolución de seguimiento).
Próximos pasos pendientes:
Implementar la edición manual de la nota antes de guardarla en la BD.
Implementar sistema de plantillas personalizables.
Añadir campo para iniciales del paciente antes de grabar.
--- FIN DE LA EXPORTACIÓN DEL PROYECTO PSINOTA IA ---
