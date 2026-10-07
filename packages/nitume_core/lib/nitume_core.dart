/// Shared Nitume core: design tokens, theme, shared widgets, API client,
/// models, repositories and auth.
///
/// Consumed by `apps/customer_app` and (later) `apps/runner_app`.
library;

export 'src/api/api_config.dart';
export 'src/api/api_exception.dart';
export 'src/api/nitume_api_client.dart';
export 'src/auth/auth_repository.dart';
export 'src/models/app_notification.dart';
export 'src/models/app_user.dart';
export 'src/models/auth_tokens.dart';
export 'src/models/customer_profile.dart';
export 'src/models/enums.dart';
export 'src/models/errand.dart';
export 'src/storage/token_store.dart';
export 'src/theme/nitume_colors.dart';
export 'src/theme/nitume_design_choices.dart';
export 'src/theme/nitume_theme.dart';
export 'src/theme/nitume_typography.dart';
export 'src/theme/status_tone.dart';
export 'src/utils/formatters.dart';
export 'src/utils/phone.dart';
export 'src/widgets/nitume_card.dart';
export 'src/widgets/num_text.dart';
export 'src/widgets/status_chip.dart';
export 'src/widgets/status_presentation.dart';
