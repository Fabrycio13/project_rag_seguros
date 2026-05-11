const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function clearSessions() {
  console.log('🗑️  Limpando todas as sessões de chat...');
  
  const { error } = await supabase
    .from('chat_sessions')
    .delete()
    .neq('chat_id', '0'); // Delete everything

  if (error) {
    console.error('❌ Erro ao limpar sessões:', error.message);
  } else {
    console.log('✅ Todas as conversas foram deletadas com sucesso!');
  }
}

clearSessions();
