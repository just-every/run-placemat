/** Stable native refusal codes shared by person HTTP and agent adapters. */
export function problemCode(status:number){
 return status===404?'resource_unavailable':status===403?'native_authority_required':status===409?'native_conflict':'invalid_arguments'
}
